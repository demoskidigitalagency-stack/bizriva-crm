-- Bizriva CRM — SMS through Termii (2026-11-06).
--
-- The owner adds their Termii API key (kept in Vault) and approved sender ID.
-- Then:
--   • messages written in an SMS chat are sent by SMS (sms-send, every minute);
--   • with "SMS backup" on, order and delivery updates (purpose = 'service')
--     that WhatsApp couldn't deliver — or that would wait because WhatsApp
--     isn't connected — are sent by SMS instead, once.
-- Service SMS use Termii's DND route (reaches numbers on Do-Not-Disturb);
-- anything else uses the generic route and is never sent to someone who
-- opted out. SMS is outbound only (Nigerian sender IDs can't receive replies).

alter table public.workspaces add column sms_key_secret_id uuid, add column sms_settings jsonb not null default '{"provider": "none"}';
alter table public.messages add column purpose text check (purpose in ('service', 'marketing')), add column fallback_of uuid;
create unique index messages_one_fallback on public.messages (fallback_of) where fallback_of is not null;

-- Order and delivery updates are service messages.
create or replace function private.queue_to_customer(ws uuid, contact uuid, body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare conv uuid; mid uuid; prev text;
begin
  select id into conv from conversations where workspace_id = ws and contact_id = contact
    order by (channel = 'whatsapp') desc, coalesce(last_inbound_at, created_at) desc limit 1;
  if conv is null then conv := private.wa_conversation(ws, contact); end if;
  prev := private.sys_on();
  insert into messages(workspace_id, conversation_id, direction, body, status, purpose) values (ws, conv, 'out', body, 'queued', 'service') returning id into mid;
  perform private.sys_restore(prev);
  return mid;
end $$;

create or replace function public.save_sms_key(p_workspace uuid, p_sender text, p_secret text, p_fallback boolean) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid; prev text;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect SMS' using errcode = '42501'; end if;
  if coalesce(btrim(p_sender), '') !~ '^[A-Za-z0-9 ]{3,11}$' then raise exception 'The sender ID is 3–11 letters or numbers, as approved by Termii'; end if;
  select sms_key_secret_id into sid from workspaces where id = p_workspace;
  if length(coalesce(p_secret, '')) < 20 and (sid is null or coalesce(p_secret, '') <> '') then raise exception 'That doesn''t look like a Termii API key'; end if;
  if sid is null then sid := vault.create_secret(p_secret, 'sms_' || p_workspace::text || '_' || extract(epoch from now())::bigint, 'Termii key for workspace ' || p_workspace);
  elsif coalesce(p_secret, '') <> '' then perform vault.update_secret(sid, p_secret); end if;
  prev := private.sys_on();
  update workspaces set sms_key_secret_id = sid,
    sms_settings = jsonb_build_object('provider', 'termii', 'sender', btrim(p_sender), 'fallback', coalesce(p_fallback, true), 'connected_at', coalesce(sms_settings ->> 'connected_at', now()::text))
    where id = p_workspace;
  perform private.sys_restore(prev);
end $$;

create or replace function public.disconnect_sms(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid; prev text;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect SMS' using errcode = '42501'; end if;
  select sms_key_secret_id into sid from workspaces where id = p_workspace;
  if sid is not null then perform vault.update_secret(sid, ''); end if;
  prev := private.sys_on();
  update workspaces set sms_settings = jsonb_build_object('provider', 'none') where id = p_workspace;
  perform private.sys_restore(prev);
end $$;
revoke execute on function public.save_sms_key(uuid, text, text, boolean), public.disconnect_sms(uuid) from public, anon;
grant execute on function public.save_sms_key(uuid, text, text, boolean), public.disconnect_sms(uuid) to authenticated;

create or replace function private.sms_on(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(sms_settings ->> 'provider', 'none') = 'termii' and sms_key_secret_id is not null from workspaces where id = ws;
$$;

-- The customer's SMS chat (made when first needed).
create or replace function private.sms_conversation(ws uuid, contact uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare conv uuid; prev text;
begin
  select id into conv from conversations where workspace_id = ws and contact_id = contact and channel = 'sms' order by created_at desc limit 1;
  if conv is null then
    prev := private.sys_on();
    insert into conversations(workspace_id, contact_id, channel, handled_by) values (ws, contact, 'sms', 'human') returning id into conv;
    perform private.sys_restore(prev);
  end if;
  return conv;
end $$;

-- Send one service message again by SMS (once).
create or replace function private.sms_fallback(m messages, why text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid; prev text;
begin
  if m.purpose is distinct from 'service' or m.fallback_of is not null or coalesce(btrim(m.body), '') = '' then return; end if;
  if not private.sms_on(m.workspace_id) or not coalesce((select (sms_settings ->> 'fallback')::boolean from workspaces where id = m.workspace_id), true) then return; end if;
  select contact_id into cid from conversations where id = m.conversation_id;
  if length(private.phone_key((select phone from contacts where id = cid))) < 10 then return; end if;
  prev := private.sys_on();
  insert into messages(workspace_id, conversation_id, direction, body, status, purpose, fallback_of)
    values (m.workspace_id, private.sms_conversation(m.workspace_id, cid), 'out', m.body, 'queued', 'service', m.id)
    on conflict do nothing;
  if why is not null then update messages set status = 'failed', error = why where id = m.id and status = 'queued'; end if;
  perform private.sys_restore(prev);
end $$;

create or replace function private.sms_on_wa_failed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'out' and new.status = 'failed' and old.status is distinct from 'failed' then perform private.sms_fallback(new, null); end if;
  return null;
end $$;
create trigger sms_on_wa_failed after update of status on public.messages for each row execute function private.sms_on_wa_failed();
grant execute on function private.sms_on_wa_failed() to authenticated, service_role;

-- For the sender: catch service messages stuck because WhatsApp isn't connected, then hand out the SMS queue.
create or replace function public.svc_sms_claim(p_limit int) returns table(id uuid, workspace_id uuid, to_phone text, body text, api_key text, sender text, route text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text; m messages;
begin
  for m in select x.* from messages x join conversations c on c.id = x.conversation_id and c.channel = 'whatsapp'
           where x.direction = 'out' and x.status = 'queued' and x.purpose = 'service' and x.created_at < now() - interval '2 minutes'
             and not exists (select 1 from whatsapp_numbers w where w.workspace_id = x.workspace_id and w.active) and private.sms_on(x.workspace_id)
           limit 200 loop
    perform private.sms_fallback(m, 'WhatsApp isn''t connected — sent by SMS instead');
  end loop;
  prev := private.sys_on();
  -- Non-service SMS never go to someone who opted out.
  update messages x set status = 'failed', error = 'Customer opted out of messages'
    from conversations c where c.id = x.conversation_id and c.channel = 'sms' and x.direction = 'out' and x.status = 'queued'
      and x.purpose is distinct from 'service' and private.opted_out(c.contact_id);
  return query
  with picked as (
    select x.id from messages x join conversations c on c.id = x.conversation_id and c.channel = 'sms'
    where x.direction = 'out' and x.status = 'queued' and x.send_attempts < 3 and (x.claimed_at is null or x.claimed_at < now() - interval '10 minutes')
      and private.sms_on(x.workspace_id)
    order by x.created_at limit least(greatest(p_limit, 1), 100)
    for update of x skip locked
  ), upd as (
    update messages x set claimed_at = now(), send_attempts = x.send_attempts + 1 from picked where x.id = picked.id
    returning x.id, x.workspace_id, x.conversation_id, x.body, x.purpose
  )
  select u.id, u.workspace_id, private.phone_key(k.phone), u.body, s.decrypted_secret, w.sms_settings ->> 'sender',
         case when u.purpose = 'service' then 'dnd' else 'generic' end
  from upd u join conversations c on c.id = u.conversation_id join contacts k on k.id = c.contact_id
  join workspaces w on w.id = u.workspace_id join vault.decrypted_secrets s on s.id = w.sms_key_secret_id;
  perform private.sys_restore(prev);
end $$;

create or replace function public.svc_sms_result(p_message uuid, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid;
begin
  prev := private.sys_on();
  if p_provider_id is not null then
    update messages set status = 'sent', provider_message_id = 'termii:' || p_provider_id, error = null where id = p_message returning workspace_id into ws;
    update workspaces set sms_settings = sms_settings - 'last_error' || jsonb_build_object('last_sent_at', now()) where id = ws;
  else
    update messages set status = case when send_attempts >= 3 or p_error like 'No phone%' or p_error like '4%' then 'failed'::message_status else 'queued'::message_status end,
      error = left(p_error, 500), claimed_at = case when send_attempts >= 3 then claimed_at else null end where id = p_message returning workspace_id into ws;
    update workspaces set sms_settings = sms_settings || jsonb_build_object('last_error', left(p_error, 300)) where id = ws;
  end if;
  perform private.sys_restore(prev);
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_sms_claim(int)', 'svc_sms_result(uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

select cron.schedule('bizriva-sms-send', '* * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/sms-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
  where exists (select 1 from public.workspaces w where w.sms_settings ->> 'provider' = 'termii'
                  and exists (select 1 from public.messages m where m.workspace_id = w.id and m.direction = 'out' and m.status = 'queued' limit 1))
$job$);
