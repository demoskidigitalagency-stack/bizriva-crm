-- Bizriva CRM — WhatsApp Cloud API: connect a number, receive messages, send the queue (2026-11-06).
--
-- Each business connects its own WhatsApp Business number (Meta app). The access
-- token and app secret live in Supabase Vault; the app never reads them back.
-- Inbound: whatsapp-webhook Edge Function (signature checked, duplicates ignored).
-- Outbound: whatsapp-send Edge Function, run every minute, sends queued messages:
--   inside 24 hours of the customer's last message → a normal message;
--   outside → only an approved template, otherwise marked failed with the reason.

create table public.whatsapp_numbers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^\d{6,25}$'),
  waba_id text check (waba_id is null or waba_id ~ '^\d{6,25}$'),
  display_phone text check (length(display_phone) <= 30),
  token_secret_id uuid not null,
  app_secret_id uuid not null,
  verify_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  last_sent_at timestamptz,
  last_error text
);
alter table public.whatsapp_numbers enable row level security;
-- Owners and managers see the connection (the verify token is pasted into Meta). Changes go through the functions below.
create policy "owners and managers see the WhatsApp number" on public.whatsapp_numbers for select to authenticated
  using (private.has_role(workspace_id, array['owner','manager']::member_role[]));

alter table public.messages add column error text check (length(error) <= 500), add column claimed_at timestamptz, add column send_attempts int not null default 0;
create index messages_whatsapp_queue on public.messages (created_at) where status = 'queued' and direction = 'out';

-- Connect or update the number. Owners only.
create or replace function public.save_whatsapp(p_workspace uuid, p_phone_number_id text, p_waba_id text, p_display_phone text, p_token text, p_app_secret text)
returns text language plpgsql security definer set search_path = public as $$
declare cur whatsapp_numbers; tid uuid; aid uuid;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect WhatsApp' using errcode = '42501'; end if;
  if coalesce(p_phone_number_id, '') !~ '^\d{6,25}$' then raise exception 'The Phone number ID is the long number from Meta (WhatsApp → API setup), not the phone number'; end if;
  if nullif(p_waba_id, '') is not null and p_waba_id !~ '^\d{6,25}$' then raise exception 'The WhatsApp Business Account ID is a long number'; end if;
  select * into cur from whatsapp_numbers where workspace_id = p_workspace;
  if cur is null and (length(coalesce(p_token, '')) < 20 or length(coalesce(p_app_secret, '')) < 16) then
    raise exception 'Add the access token and the app secret from your Meta app';
  end if;
  if cur is null then
    tid := vault.create_secret(p_token, 'wa_token_' || p_workspace, 'WhatsApp token for workspace ' || p_workspace);
    aid := vault.create_secret(p_app_secret, 'wa_app_secret_' || p_workspace, 'WhatsApp app secret for workspace ' || p_workspace);
    insert into whatsapp_numbers(workspace_id, phone_number_id, waba_id, display_phone, token_secret_id, app_secret_id, connected_by)
      values (p_workspace, p_phone_number_id, nullif(p_waba_id, ''), left(nullif(p_display_phone, ''), 30), tid, aid, auth.uid());
  else
    if length(coalesce(p_token, '')) >= 20 then perform vault.update_secret(cur.token_secret_id, p_token); end if;
    if length(coalesce(p_app_secret, '')) >= 16 then perform vault.update_secret(cur.app_secret_id, p_app_secret); end if;
    update whatsapp_numbers set phone_number_id = p_phone_number_id, waba_id = nullif(p_waba_id, ''), display_phone = left(nullif(p_display_phone, ''), 30),
      active = true, last_error = null, connected_by = auth.uid(), connected_at = now() where workspace_id = p_workspace;
  end if;
  return (select verify_token from whatsapp_numbers where workspace_id = p_workspace);
end $$;
create or replace function public.disconnect_whatsapp(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur whatsapp_numbers;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect WhatsApp' using errcode = '42501'; end if;
  select * into cur from whatsapp_numbers where workspace_id = p_workspace;
  if cur is null then return; end if;
  delete from vault.secrets where id in (cur.token_secret_id, cur.app_secret_id);
  delete from whatsapp_numbers where workspace_id = p_workspace;
end $$;
revoke execute on function public.save_whatsapp(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_whatsapp(uuid, text, text, text, text, text) to authenticated;
revoke execute on function public.disconnect_whatsapp(uuid) from public, anon;
grant execute on function public.disconnect_whatsapp(uuid) to authenticated;

-- ───────────── server-only (Edge Functions with the service key) ─────────────

-- Meta's one-time address check: is this one of our verify tokens?
create or replace function public.svc_whatsapp_verify(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from whatsapp_numbers where verify_token = p_token and active);
$$;

-- Keys for a number, found by Meta's phone number id.
create or replace function public.svc_whatsapp_keys(p_phone_number_id text) returns table(workspace_id uuid, app_secret text, token text)
language sql stable security definer set search_path = public as $$
  select w.workspace_id, a.decrypted_secret, t.decrypted_secret from whatsapp_numbers w
  join vault.decrypted_secrets a on a.id = w.app_secret_id join vault.decrypted_secrets t on t.id = w.token_secret_id
  where w.phone_number_id = p_phone_number_id and w.active;
$$;

-- A customer's message. Same Meta message id is saved once. STOP-style words opt the customer out of marketing.
create or replace function public.svc_whatsapp_inbound(p_workspace uuid, p_wa_id text, p_name text, p_msg_id text, p_body text, p_type text, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid; conv uuid; mid uuid; prev text; words text[]; stop boolean := false;
begin
  if coalesce(p_msg_id, '') = '' or coalesce(p_wa_id, '') !~ '^\d{7,15}$' then return jsonb_build_object('status', 'ignored'); end if;
  if exists (select 1 from messages where workspace_id = p_workspace and provider_message_id = p_msg_id) then return jsonb_build_object('status', 'duplicate'); end if;
  prev := private.sys_on();
  select contact_id into cid from contact_identities where workspace_id = p_workspace and channel = 'whatsapp' and external_id = p_wa_id;
  if cid is null then
    cid := private.find_or_add_contact(p_workspace, p_name, '+' || p_wa_id, null, null, null, null);
    insert into contact_identities(workspace_id, contact_id, channel, external_id) values (p_workspace, cid, 'whatsapp', p_wa_id) on conflict do nothing;
  end if;
  select id into conv from conversations where workspace_id = p_workspace and contact_id = cid and channel = 'whatsapp' order by (status <> 'closed') desc, created_at desc limit 1;
  if conv is null then
    insert into conversations(workspace_id, contact_id, channel) values (p_workspace, cid, 'whatsapp') returning id into conv;
  end if;
  insert into messages(workspace_id, conversation_id, direction, body, status, provider_message_id, created_at)
    values (p_workspace, conv, 'in', left(coalesce(p_body, '[' || coalesce(p_type, 'message') || ']'), 4096), 'received', p_msg_id, least(coalesce(p_at, now()), now()))
    on conflict (workspace_id, provider_message_id) do nothing returning id into mid;
  if mid is null then perform private.sys_restore(prev); return jsonb_build_object('status', 'duplicate'); end if;
  update conversations set last_inbound_at = greatest(coalesce(last_inbound_at, '-infinity'), coalesce(p_at, now())), status = case when status = 'closed' then 'open' else status end where id = conv;
  update whatsapp_numbers set last_inbound_at = now() where workspace_id = p_workspace;
  select coalesce(array(select upper(jsonb_array_elements_text(settings -> 'optOutKeywords'))), array['STOP']) into words from workspaces where id = p_workspace;
  if cardinality(words) = 0 then words := array['STOP']; end if;
  stop := upper(btrim(coalesce(p_body, ''))) = any(words);
  if stop then
    insert into consents(workspace_id, contact_id, channel, category, granted, source, evidence) values (p_workspace, cid, 'whatsapp', 'marketing', false, 'customer replied ' || upper(btrim(p_body)), p_msg_id);
  end if;
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'saved', 'message', mid, 'contact', cid, 'conversation', conv, 'opted_out', stop);
end $$;

-- Delivery receipts from Meta: sent → delivered → read; failed with the reason.
create or replace function public.svc_whatsapp_status(p_workspace uuid, p_msg_id text, p_status text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; rank_new int := array_position(array['sent','delivered','read'], p_status);
begin
  prev := private.sys_on();
  if p_status = 'failed' then
    update messages set status = 'failed', error = left(p_error, 500) where workspace_id = p_workspace and provider_message_id = p_msg_id and direction = 'out';
  elsif rank_new is not null then
    update messages set status = p_status::message_status where workspace_id = p_workspace and provider_message_id = p_msg_id and direction = 'out'
      and coalesce(array_position(array['sent','delivered','read'], status::text), 0) < rank_new and status <> 'failed';
  end if;
  perform private.sys_restore(prev);
end $$;

-- Take up to p_limit queued WhatsApp messages to send (each is taken once; retried after 10 minutes if the sender stopped).
create or replace function public.svc_whatsapp_claim(p_limit int) returns table(
  id uuid, workspace_id uuid, phone_number_id text, token text, to_phone text, body text, template_name text, in_window boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text;
begin
  prev := private.sys_on();
  return query
  with picked as (
    select m.id from messages m
    join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
    join whatsapp_numbers w on w.workspace_id = m.workspace_id and w.active
    where m.direction = 'out' and m.status = 'queued' and m.send_attempts < 3 and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')
    order by m.created_at limit least(greatest(p_limit, 1), 100)
    for update of m skip locked
  ), upd as (
    update messages m set claimed_at = now(), send_attempts = m.send_attempts + 1 from picked where m.id = picked.id
    returning m.id, m.workspace_id, m.conversation_id, m.body, m.template_name
  )
  select u.id, u.workspace_id, w.phone_number_id, t.decrypted_secret,
    coalesce((select ci.external_id from contact_identities ci where ci.contact_id = c.contact_id and ci.channel = 'whatsapp' limit 1), private.phone_key(k.phone)),
    u.body, u.template_name, coalesce(c.last_inbound_at > now() - interval '24 hours', false)
  from upd u join conversations c on c.id = u.conversation_id join contacts k on k.id = c.contact_id
  join whatsapp_numbers w on w.workspace_id = u.workspace_id join vault.decrypted_secrets t on t.id = w.token_secret_id;
  perform private.sys_restore(prev);
end $$;

-- The sender reports back.
create or replace function public.svc_whatsapp_result(p_message uuid, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid;
begin
  prev := private.sys_on();
  if p_provider_id is not null then
    update messages set status = 'sent', provider_message_id = p_provider_id, error = null where id = p_message returning workspace_id into ws;
    update whatsapp_numbers set last_sent_at = now(), last_error = null where workspace_id = ws;
  else
    update messages set status = case when send_attempts >= 3 or p_error like 'Outside%' or p_error like 'No phone%' then 'failed'::message_status else 'queued'::message_status end,
      error = left(p_error, 500), claimed_at = case when send_attempts >= 3 then claimed_at else null end where id = p_message returning workspace_id into ws;
    update whatsapp_numbers set last_error = left(p_error, 500) where workspace_id = ws;
  end if;
  perform private.sys_restore(prev);
end $$;

-- The every-minute job proves itself with a secret kept in Vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'bizriva_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bizriva_cron_secret', 'Proves scheduled calls to Edge Functions come from the database');
  end if;
end $$;
create or replace function public.svc_cron_ok(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_secret, '') <> '' and exists (select 1 from vault.decrypted_secrets where name = 'bizriva_cron_secret' and decrypted_secret = p_secret);
$$;

do $$
declare f text;
begin
  foreach f in array array['svc_whatsapp_verify(text)', 'svc_whatsapp_keys(text)', 'svc_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz)',
    'svc_whatsapp_status(uuid, text, text, text)', 'svc_whatsapp_claim(int)', 'svc_whatsapp_result(uuid, text, text)', 'svc_cron_ok(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Send the queue every minute (only does work when a number is connected and something is queued).
select cron.schedule('bizriva-whatsapp-send', '* * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
  where exists (select 1 from public.messages m join public.whatsapp_numbers w on w.workspace_id = m.workspace_id and w.active where m.status = 'queued' and m.direction = 'out' limit 1)
$job$);

alter publication supabase_realtime add table public.whatsapp_numbers;
