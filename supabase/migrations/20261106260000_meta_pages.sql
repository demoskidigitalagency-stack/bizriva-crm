-- Bizriva CRM — Facebook Page: Messenger and Instagram chats, and Meta lead-form leads (2026-11-06).
--
-- The owner connects their Facebook Page (Page ID, a long-lived Page access
-- token and the Meta app secret; the Instagram account linked to the Page is
-- optional). Both secrets go to Vault. Meta calls the meta-webhook function:
--   • Messenger / Instagram DMs land in the Inbox (the AI answers them too);
--   • a lead-form submission becomes a customer + lead (with the ad it came
--     from) and a "Call this new lead" task for the agent who's up next.
-- Replies go back through meta-send (every minute). Meta only allows replies
-- within 24 hours of the customer's last message; later ones are marked failed with the reason.

create table public.meta_pages (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  page_id text not null unique check (page_id ~ '^\d{5,25}$'),
  page_name text,
  ig_account_id text unique check (ig_account_id is null or ig_account_id ~ '^\d{5,25}$'),
  token_secret_id uuid not null,
  app_secret_id uuid not null,
  verify_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  active boolean not null default true,
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  last_event_at timestamptz,
  last_sent_at timestamptz,
  last_error text
);
alter table public.meta_pages enable row level security;
create policy "team sees the Page connection" on public.meta_pages for select using (private.is_member(workspace_id));

create table public.meta_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  leadgen_id text not null unique,
  form_id text, ad_id text, platform text,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  fields jsonb not null default '{}',
  error text,
  received_at timestamptz not null default now()
);
alter table public.meta_leads enable row level security;
create policy "team sees Meta leads" on public.meta_leads for select using (private.is_member(workspace_id));

create or replace function public.save_meta_page(p_workspace uuid, p_page_id text, p_page_name text, p_ig_id text, p_token text, p_app_secret text) returns text
language plpgsql security definer set search_path = public as $$
declare cur meta_pages; tid uuid; aid uuid;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect the Facebook Page' using errcode = '42501'; end if;
  if coalesce(btrim(p_page_id), '') !~ '^\d{5,25}$' then raise exception 'The Page ID is a long number (Page → About → Page transparency, or Meta Business Suite → Settings)'; end if;
  if nullif(btrim(p_ig_id), '') is not null and btrim(p_ig_id) !~ '^\d{5,25}$' then raise exception 'The Instagram account ID is a long number'; end if;
  select * into cur from meta_pages where workspace_id = p_workspace;
  if cur.workspace_id is null and (length(coalesce(p_token, '')) < 50 or length(coalesce(p_app_secret, '')) < 16) then
    raise exception 'Paste the Page access token and the app secret';
  end if;
  if cur.workspace_id is null then
    tid := vault.create_secret(p_token, 'meta_page_' || p_workspace || '_' || extract(epoch from now())::bigint, 'Facebook Page token');
    aid := vault.create_secret(p_app_secret, 'meta_app_' || p_workspace || '_' || extract(epoch from now())::bigint, 'Meta app secret');
    insert into meta_pages(workspace_id, page_id, page_name, ig_account_id, token_secret_id, app_secret_id, connected_by)
      values (p_workspace, btrim(p_page_id), left(nullif(btrim(p_page_name), ''), 120), nullif(btrim(p_ig_id), ''), tid, aid, auth.uid());
  else
    if length(coalesce(p_token, '')) >= 50 then perform vault.update_secret(cur.token_secret_id, p_token); end if;
    if length(coalesce(p_app_secret, '')) >= 16 then perform vault.update_secret(cur.app_secret_id, p_app_secret); end if;
    update meta_pages set page_id = btrim(p_page_id), page_name = left(nullif(btrim(p_page_name), ''), 120), ig_account_id = nullif(btrim(p_ig_id), ''), active = true, last_error = null
      where workspace_id = p_workspace;
  end if;
  return (select verify_token from meta_pages where workspace_id = p_workspace);
end $$;

create or replace function public.disconnect_meta_page(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur meta_pages;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect the Page' using errcode = '42501'; end if;
  select * into cur from meta_pages where workspace_id = p_workspace;
  if cur.workspace_id is null then return; end if;
  perform vault.update_secret(cur.token_secret_id, ''); perform vault.update_secret(cur.app_secret_id, '');
  update meta_pages set active = false where workspace_id = p_workspace;
end $$;
revoke execute on function public.save_meta_page(uuid, text, text, text, text, text), public.disconnect_meta_page(uuid) from public, anon;
grant execute on function public.save_meta_page(uuid, text, text, text, text, text), public.disconnect_meta_page(uuid) to authenticated;

-- ───── for the webhook (service only) ─────
create or replace function public.svc_meta_verify(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meta_pages where verify_token = p_token and active);
$$;

-- Keys for the Page (or Instagram account) Meta is writing about.
create or replace function public.svc_meta_keys(p_id text) returns table(workspace_id uuid, page_id text, ig_account_id text, token text, app_secret text)
language sql stable security definer set search_path = public as $$
  select p.workspace_id, p.page_id, p.ig_account_id, t.decrypted_secret, a.decrypted_secret
  from meta_pages p join vault.decrypted_secrets t on t.id = p.token_secret_id join vault.decrypted_secrets a on a.id = p.app_secret_id
  where p.active and (p.page_id = p_id or p.ig_account_id = p_id);
$$;

create or replace function public.svc_meta_inbound(p_workspace uuid, p_channel text, p_sender text, p_name text, p_mid text, p_body text, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid; conv uuid; mid uuid; prev text; ch channel; words text[];
begin
  if p_channel not in ('messenger', 'instagram') or coalesce(p_mid, '') = '' or coalesce(p_sender, '') !~ '^\d{5,30}$' then return jsonb_build_object('status', 'ignored'); end if;
  ch := p_channel::channel;
  if exists (select 1 from messages where workspace_id = p_workspace and provider_message_id = p_mid) then return jsonb_build_object('status', 'duplicate'); end if;
  prev := private.sys_on();
  select contact_id into cid from contact_identities where workspace_id = p_workspace and channel = ch and external_id = p_sender;
  if cid is null then
    insert into contacts(workspace_id, name) values (p_workspace, left(coalesce(nullif(btrim(p_name), ''), initcap(p_channel) || ' customer'), 120)) returning id into cid;
    insert into contact_identities(workspace_id, contact_id, channel, external_id) values (p_workspace, cid, ch, p_sender) on conflict do nothing;
  end if;
  select id into conv from conversations where workspace_id = p_workspace and contact_id = cid and channel = ch order by (status <> 'closed') desc, created_at desc limit 1;
  if conv is null then insert into conversations(workspace_id, contact_id, channel) values (p_workspace, cid, ch) returning id into conv; end if;
  insert into messages(workspace_id, conversation_id, direction, body, status, provider_message_id, created_at)
    values (p_workspace, conv, 'in', left(coalesce(nullif(p_body, ''), '[attachment]'), 4096), 'received', p_mid, least(coalesce(p_at, now()), now()))
    on conflict (workspace_id, provider_message_id) do nothing returning id into mid;
  if mid is null then perform private.sys_restore(prev); return jsonb_build_object('status', 'duplicate'); end if;
  update conversations set last_inbound_at = greatest(coalesce(last_inbound_at, '-infinity'), coalesce(p_at, now())), status = case when status = 'closed' then 'open' else status end where id = conv;
  update meta_pages set last_event_at = now() where workspace_id = p_workspace;
  select coalesce(array(select upper(jsonb_array_elements_text(settings -> 'optOutKeywords'))), array['STOP']) into words from workspaces where id = p_workspace;
  if upper(btrim(coalesce(p_body, ''))) = any(case when cardinality(words) = 0 then array['STOP'] else words end) then
    insert into consents(workspace_id, contact_id, channel, category, granted, source, evidence) values (p_workspace, cid, ch, 'marketing', false, 'customer replied ' || upper(btrim(p_body)), p_mid);
  end if;
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'saved', 'message', mid, 'contact', cid, 'conversation', conv);
end $$;

-- A lead-form submission (fields already fetched from Meta).
create or replace function public.svc_meta_lead(p_workspace uuid, p_leadgen text, p_form text, p_ad text, p_platform text, p_fields jsonb, p_error text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid; lid uuid; prev text; nm text; ph text; em text; city text; ch channel; who uuid; ml uuid;
begin
  if coalesce(p_leadgen, '') = '' then return jsonb_build_object('status', 'ignored'); end if;
  prev := private.sys_on();
  insert into meta_leads(workspace_id, leadgen_id, form_id, ad_id, platform, fields, error)
    values (p_workspace, p_leadgen, p_form, p_ad, p_platform, coalesce(p_fields, '{}'), p_error)
    on conflict (leadgen_id) do nothing returning id into ml;
  if ml is null then perform private.sys_restore(prev); return jsonb_build_object('status', 'duplicate'); end if;
  if p_error is not null then perform private.sys_restore(prev); return jsonb_build_object('status', 'error'); end if;
  nm := coalesce(nullif(p_fields ->> 'full_name', ''), nullif(btrim(concat_ws(' ', p_fields ->> 'first_name', p_fields ->> 'last_name')), ''), 'Meta lead');
  ph := coalesce(p_fields ->> 'phone_number', p_fields ->> 'phone', p_fields ->> 'whatsapp_number');
  em := p_fields ->> 'email';
  city := coalesce(p_fields ->> 'city', p_fields ->> 'state', p_fields ->> 'province');
  ch := case when lower(coalesce(p_platform, '')) in ('ig', 'instagram') then 'instagram' else 'messenger' end;
  cid := private.find_or_add_contact(p_workspace, left(nm, 120), ph, lower(nullif(em, '')), coalesce(p_fields ->> 'street_address', p_fields ->> 'address'), city, null);
  insert into leads(workspace_id, contact_id, source_channel, ad_id, stage, score) values (p_workspace, cid, ch, p_ad, 'new_lead', 10) returning id into lid;
  update meta_leads set contact_id = cid, lead_id = lid where id = ml;
  who := private.pick_chat_agent(p_workspace);
  insert into tasks(workspace_id, contact_id, title, type, priority, due_at, assigned_to)
    values (p_workspace, cid, 'Call new lead from your ' || case when ch = 'instagram' then 'Instagram' else 'Facebook' end || ' ad: ' || left(nm, 80), 'call', 'high', now() + interval '15 minutes', who);
  insert into activity_log(workspace_id, entity, entity_id, action, detail) values (p_workspace, 'contact', cid, 'meta_lead', jsonb_build_object('form', p_form, 'ad', p_ad, 'fields', p_fields));
  update meta_pages set last_event_at = now() where workspace_id = p_workspace;
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'saved', 'contact', cid, 'lead', lid);
end $$;

-- ───── for the sender (service only) ─────
create or replace function public.svc_meta_claim(p_limit int) returns table(id uuid, workspace_id uuid, channel text, page_id text, token text, recipient text, body text, in_window boolean, media_path text, media_kind text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text;
begin
  prev := private.sys_on();
  return query
  with picked as (
    select m.id from messages m
    join conversations c on c.id = m.conversation_id and c.channel in ('messenger', 'instagram')
    join meta_pages p on p.workspace_id = m.workspace_id and p.active
    where m.direction = 'out' and m.status = 'queued' and m.send_attempts < 3 and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')
    order by m.created_at limit least(greatest(p_limit, 1), 100)
    for update of m skip locked
  ), upd as (
    update messages m set claimed_at = now(), send_attempts = m.send_attempts + 1 from picked where m.id = picked.id
    returning m.id, m.workspace_id, m.conversation_id, m.body, m.media_path, m.media_kind
  )
  select u.id, u.workspace_id, c.channel::text, p.page_id, t.decrypted_secret,
    (select ci.external_id from contact_identities ci where ci.contact_id = c.contact_id and ci.channel = c.channel limit 1),
    u.body, coalesce(c.last_inbound_at > now() - interval '24 hours', false), u.media_path, u.media_kind
  from upd u join conversations c on c.id = u.conversation_id
  join meta_pages p on p.workspace_id = u.workspace_id join vault.decrypted_secrets t on t.id = p.token_secret_id;
  perform private.sys_restore(prev);
end $$;

create or replace function public.svc_meta_result(p_message uuid, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid;
begin
  prev := private.sys_on();
  if p_provider_id is not null then
    update messages set status = 'sent', provider_message_id = p_provider_id, error = null where id = p_message returning workspace_id into ws;
    update meta_pages set last_sent_at = now(), last_error = null where workspace_id = ws;
  else
    update messages set status = case when send_attempts >= 3 or p_error like 'Outside%' or p_error like 'No %' or p_error like '(#10)%' or p_error like '(#100)%' or p_error like '(#551)%' then 'failed'::message_status else 'queued'::message_status end,
      error = left(p_error, 500), claimed_at = case when send_attempts >= 3 then claimed_at else null end where id = p_message returning workspace_id into ws;
    update meta_pages set last_error = left(p_error, 500) where workspace_id = ws;
  end if;
  perform private.sys_restore(prev);
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_meta_verify(text)', 'svc_meta_keys(text)', 'svc_meta_inbound(uuid, text, text, text, text, text, timestamptz)',
    'svc_meta_lead(uuid, text, text, text, text, jsonb, text)', 'svc_meta_claim(int)', 'svc_meta_result(uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

select cron.schedule('bizriva-meta-send', '* * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/meta-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
  where exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id and c.channel in ('messenger', 'instagram')
                join public.meta_pages p on p.workspace_id = m.workspace_id and p.active where m.status = 'queued' and m.direction = 'out' limit 1)
$job$);

alter publication supabase_realtime add table public.meta_leads;
