-- Bizriva CRM — "Connect WhatsApp" with Meta's sign-up, keeping the phone app (Coexistence) (2026-11-07).
--
-- Bizriva is a Meta Tech Provider with ONE Meta app. A business clicks Connect,
-- logs in with Facebook in Meta's window, picks or scans their number, and is done:
--   • a number already on the WhatsApp Business app stays on the phone (Coexistence);
--     Meta then sends up to 6 months of one-to-one chats and the phone's contacts,
--     and every message the business sends from the phone ("echoes");
--   • a new number is registered for Bizriva only.
-- The Super Admin saves Bizriva's Meta app (App ID, sign-up configuration ID,
-- app secret) once on the Super Admin page. The manual "own Meta app" way still works.
--
-- History is history: imported, never opens the 24-hour window, never wakes the
-- assistant, never starts reminders, never counts in response times.
-- A reply the business sends from the phone is a real reply: it shows in the chat
-- and the assistant steps back from that chat so the two don't talk over each other.

-- ───────────── Bizriva's Meta app (one row) ─────────────
create table private.platform_meta (
  id boolean primary key default true check (id),
  app_id text check (app_id ~ '^\d{6,25}$'),
  config_id text check (config_id ~ '^\d{6,25}$'),
  app_secret_id uuid,
  verify_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into private.platform_meta(id) values (true) on conflict do nothing;

-- What the Connect button needs (public IDs only).
create or replace function public.platform_meta() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('appId', app_id, 'configId', config_id, 'ready', app_id is not null and config_id is not null and app_secret_id is not null)
  from private.platform_meta where id;
$$;
revoke execute on function public.platform_meta() from public, anon;
grant execute on function public.platform_meta() to authenticated;

-- Super Admin view and save.
create or replace function public.admin_meta_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  return (select jsonb_build_object('appId', app_id, 'configId', config_id, 'hasSecret', app_secret_id is not null, 'verifyToken', verify_token, 'updatedAt', updated_at,
    'numbers', (select count(*) from whatsapp_numbers where via = 'partner' and active), 'onApp', (select count(*) from whatsapp_numbers where via = 'partner' and on_app and active))
    from private.platform_meta where id);
end $$;
create or replace function public.admin_set_meta(p_app_id text, p_config_id text, p_app_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare cur private.platform_meta;
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  if coalesce(p_app_id, '') !~ '^\d{6,25}$' then raise exception 'The App ID is the long number at the top of your Meta app'; end if;
  if coalesce(p_config_id, '') !~ '^\d{6,25}$' then raise exception 'The configuration ID is the long number from WhatsApp → Embedded Signup (Facebook Login for Business → Configurations)'; end if;
  select * into cur from private.platform_meta where id;
  if cur.app_secret_id is null and length(coalesce(p_app_secret, '')) < 16 then raise exception 'Add the app secret (App settings → Basic)'; end if;
  if length(coalesce(p_app_secret, '')) >= 16 then
    if cur.app_secret_id is null then
      update private.platform_meta set app_secret_id = vault.create_secret(p_app_secret, 'bizriva_meta_app_secret', 'Bizriva Meta app secret') where id;
    else perform vault.update_secret(cur.app_secret_id, p_app_secret); end if;
  end if;
  update private.platform_meta set app_id = p_app_id, config_id = p_config_id, updated_at = now(), updated_by = auth.uid() where id;
end $$;
revoke execute on function public.admin_meta_settings() from public, anon;
grant execute on function public.admin_meta_settings() to authenticated;
revoke execute on function public.admin_set_meta(text, text, text) from public, anon;
grant execute on function public.admin_set_meta(text, text, text) to authenticated;

-- ───────────── numbers connected through Bizriva's app ─────────────
alter table public.whatsapp_numbers
  alter column app_secret_id drop not null,
  add column via text not null default 'manual' check (via in ('manual', 'partner')),
  add column on_app boolean not null default false,
  add column pin_secret_id uuid,
  add column history_status text check (history_status in ('syncing', 'done', 'declined', 'failed')),
  add column history_progress int check (history_progress between 0 and 100),
  add column history_messages int not null default 0,
  add column history_chats int not null default 0,
  add column contacts_synced int not null default 0,
  add column history_error text check (length(history_error) <= 300),
  add column sync_requested_at timestamptz;
alter table public.whatsapp_numbers add constraint whatsapp_numbers_secret check (via = 'partner' or app_secret_id is not null);
create index whatsapp_numbers_waba on public.whatsapp_numbers (waba_id);

-- Disconnecting also forgets the PIN.
create or replace function public.disconnect_whatsapp(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur whatsapp_numbers;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect WhatsApp' using errcode = '42501'; end if;
  select * into cur from whatsapp_numbers where workspace_id = p_workspace;
  if cur is null then return; end if;
  delete from vault.secrets where id in (cur.token_secret_id, cur.app_secret_id, cur.pin_secret_id);
  delete from whatsapp_numbers where workspace_id = p_workspace;
end $$;

-- Meta's address check: a business's own token, or Bizriva's app token.
create or replace function public.svc_whatsapp_verify(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_token, '') <> '' and (exists (select 1 from whatsapp_numbers where verify_token = p_token and active)
    or exists (select 1 from private.platform_meta where verify_token = p_token));
$$;

-- Keys for a number: its own app secret, or Bizriva's for numbers connected through Bizriva.
create or replace function public.svc_whatsapp_keys(p_phone_number_id text) returns table(workspace_id uuid, app_secret text, token text)
language sql stable security definer set search_path = public as $$
  select w.workspace_id, coalesce(a.decrypted_secret, pa.decrypted_secret), t.decrypted_secret from whatsapp_numbers w
  join vault.decrypted_secrets t on t.id = w.token_secret_id
  left join vault.decrypted_secrets a on a.id = w.app_secret_id
  left join private.platform_meta pm on pm.id and w.via = 'partner'
  left join vault.decrypted_secrets pa on pa.id = pm.app_secret_id
  where w.phone_number_id = p_phone_number_id and w.active;
$$;
-- Same, found by the WhatsApp Business Account (account-level webhooks carry no number).
create or replace function public.svc_whatsapp_keys_by_waba(p_waba text) returns table(workspace_id uuid, phone_number_id text, app_secret text, token text)
language sql stable security definer set search_path = public as $$
  select w.workspace_id, w.phone_number_id, coalesce(a.decrypted_secret, pa.decrypted_secret), t.decrypted_secret from whatsapp_numbers w
  join vault.decrypted_secrets t on t.id = w.token_secret_id
  left join vault.decrypted_secrets a on a.id = w.app_secret_id
  left join private.platform_meta pm on pm.id and w.via = 'partner'
  left join vault.decrypted_secrets pa on pa.id = pm.app_secret_id
  where w.waba_id = p_waba and w.active;
$$;

-- Bizriva's app id and secret, for the sign-up code exchange.
create or replace function public.svc_meta_platform() returns table(app_id text, app_secret text)
language sql stable security definer set search_path = public as $$
  select pm.app_id, s.decrypted_secret from private.platform_meta pm left join vault.decrypted_secrets s on s.id = pm.app_secret_id where pm.id;
$$;

-- Save a number connected through Meta's sign-up. The Edge Function has checked the
-- signed-in user; this checks they own the business.
create or replace function public.svc_whatsapp_partner_connect(p_workspace uuid, p_user uuid, p_phone_number_id text, p_waba_id text, p_display text, p_token text, p_on_app boolean, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur whatsapp_numbers; tid uuid; pid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_workspace and user_id = p_user and role = 'owner') then
    raise exception 'Only the owner can connect WhatsApp' using errcode = '42501';
  end if;
  if coalesce(p_phone_number_id, '') !~ '^\d{6,25}$' or coalesce(p_waba_id, '') !~ '^\d{6,25}$' or length(coalesce(p_token, '')) < 20 then raise exception 'Meta didn''t return the number details'; end if;
  if exists (select 1 from whatsapp_numbers where phone_number_id = p_phone_number_id and workspace_id <> p_workspace) then
    raise exception 'This WhatsApp number is already connected to another business on Bizriva';
  end if;
  select * into cur from whatsapp_numbers where workspace_id = p_workspace;
  if cur is not null then delete from vault.secrets where id in (cur.token_secret_id, cur.app_secret_id, cur.pin_secret_id); end if;
  tid := vault.create_secret(p_token, 'wa_token_' || p_workspace || '_' || extract(epoch from now())::bigint, 'WhatsApp token for workspace ' || p_workspace);
  if coalesce(p_pin, '') <> '' then pid := vault.create_secret(p_pin, 'wa_pin_' || p_workspace || '_' || extract(epoch from now())::bigint, 'WhatsApp two-step PIN for workspace ' || p_workspace); end if;
  insert into whatsapp_numbers(workspace_id, phone_number_id, waba_id, display_phone, token_secret_id, app_secret_id, pin_secret_id, connected_by, via, on_app, active, last_error,
                               history_status, history_progress, history_messages, history_chats, contacts_synced, history_error, sync_requested_at, connected_at)
    values (p_workspace, p_phone_number_id, p_waba_id, left(nullif(p_display, ''), 30), tid, null, pid, p_user, 'partner', coalesce(p_on_app, false), true, null,
            null, null, 0, 0, 0, null, null, now())
  on conflict (workspace_id) do update set phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id, display_phone = excluded.display_phone,
    token_secret_id = excluded.token_secret_id, app_secret_id = null, pin_secret_id = excluded.pin_secret_id, connected_by = excluded.connected_by, via = 'partner',
    on_app = excluded.on_app, active = true, last_error = null, history_status = null, history_progress = null, history_messages = 0, history_chats = 0,
    contacts_synced = 0, history_error = null, sync_requested_at = null, connected_at = now();
  insert into activity_log(workspace_id, entity, entity_id, action, actor, detail)
    values (p_workspace, 'workspace', p_workspace, 'whatsapp_connected', p_user, jsonb_build_object('number', p_display, 'keepsPhoneApp', coalesce(p_on_app, false)));
  return jsonb_build_object('ok', true);
end $$;

-- We asked Meta for the contacts and history (once, within 24 hours of connecting).
create or replace function public.svc_whatsapp_sync_requested(p_workspace uuid, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_numbers set sync_requested_at = now(),
    history_status = case when p_error is null then 'syncing' else 'failed' end, history_progress = case when p_error is null then 0 else history_progress end,
    history_error = left(p_error, 300) where workspace_id = p_workspace;
end $$;

-- Who a WhatsApp id belongs to (adds the customer the first time).
create or replace function private.wa_contact(p_workspace uuid, p_wa_id text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select contact_id into cid from contact_identities where workspace_id = p_workspace and channel = 'whatsapp' and external_id = p_wa_id;
  if cid is null then
    cid := private.find_or_add_contact(p_workspace, nullif(btrim(p_name), ''), '+' || p_wa_id, null, null, null, null);
    insert into contact_identities(workspace_id, contact_id, channel, external_id) values (p_workspace, cid, 'whatsapp', p_wa_id) on conflict do nothing;
  end if;
  return cid;
end $$;

-- One chunk of the phone's chat history.
-- p_threads: [{ "wa": "2348031234567", "messages": [{ "id": "wamid…", "at": iso, "out": bool, "body": text }] }]
create or replace function public.svc_whatsapp_history(p_workspace uuid, p_progress int, p_threads jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev text; t jsonb; m jsonb; cid uuid; conv uuid; added int := 0; chats int := 0; n int; last_id uuid; last_imported boolean;
begin
  prev := private.sys_on();
  for t in select * from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) loop
    if coalesce(t ->> 'wa', '') !~ '^\d{7,15}$' then continue; end if;
    cid := private.wa_contact(p_workspace, t ->> 'wa', null);
    conv := private.wa_conversation(p_workspace, cid);
    n := 0;
    for m in select * from jsonb_array_elements(coalesce(t -> 'messages', '[]'::jsonb)) loop
      if coalesce(m ->> 'id', '') = '' or coalesce(btrim(m ->> 'body'), '') = '' then continue; end if;
      insert into messages(workspace_id, conversation_id, direction, body, status, provider_message_id, imported, created_at)
        values (p_workspace, conv, (case when (m ->> 'out')::boolean then 'out' else 'in' end)::message_direction, left(m ->> 'body', 4096),
                case when (m ->> 'out')::boolean then 'sent'::message_status else 'received'::message_status end, m ->> 'id', true,
                least(coalesce(nullif(m ->> 'at', '')::timestamptz, now()), now()))
        on conflict (workspace_id, provider_message_id) do nothing;
      if found then n := n + 1; end if;
    end loop;
    if n > 0 then
      added := added + n; chats := chats + 1;
      -- The assistant never answers history: if the newest message in the chat is imported, mark it answered.
      select id, imported into last_id, last_imported from messages where conversation_id = conv order by created_at desc limit 1;
      if last_imported then update conversations set ai_answered_to = last_id where id = conv; end if;
    end if;
  end loop;
  update whatsapp_numbers set history_messages = history_messages + added, history_chats = history_chats + chats,
    history_progress = greatest(coalesce(history_progress, 0), least(greatest(coalesce(p_progress, 0), 0), 100)),
    history_status = case when coalesce(p_progress, 0) >= 100 then 'done' else 'syncing' end, history_error = null
  where workspace_id = p_workspace;
  if coalesce(p_progress, 0) >= 100 then
    insert into activity_log(workspace_id, entity, entity_id, action, detail)
      select p_workspace, 'workspace', p_workspace, 'whatsapp_history_imported', jsonb_build_object('messages', history_messages, 'chats', history_chats) from whatsapp_numbers where workspace_id = p_workspace;
  end if;
  perform private.sys_restore(prev);
  return jsonb_build_object('added', added, 'chats', chats);
end $$;

-- The business said no to sharing history, or Meta couldn't send it.
create or replace function public.svc_whatsapp_history_error(p_workspace uuid, p_code text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_numbers set history_status = case when p_code = '2593109' then 'declined' else 'failed' end,
    history_error = left(case when p_code = '2593109' then 'Chat history sharing was turned off in the WhatsApp Business app' else coalesce(p_message, 'Meta couldn''t send the chat history') end, 300)
  where workspace_id = p_workspace;
end $$;

-- The phone's contacts. "remove" never deletes a customer from Bizriva.
-- p_contacts: [{ "phone": "2348031234567", "name": "Ada", "action": "add" }]
create or replace function public.svc_whatsapp_contacts(p_workspace uuid, p_contacts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare prev text; c jsonb; n int := 0; wa text;
begin
  prev := private.sys_on();
  for c in select * from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) loop
    wa := regexp_replace(coalesce(c ->> 'phone', ''), '\D', '', 'g');
    if wa !~ '^\d{7,15}$' or coalesce(c ->> 'action', 'add') <> 'add' then continue; end if;
    perform private.wa_contact(p_workspace, wa, left(c ->> 'name', 120));
    n := n + 1;
  end loop;
  update whatsapp_numbers set contacts_synced = contacts_synced + n where workspace_id = p_workspace;
  perform private.sys_restore(prev);
  return n;
end $$;

-- The business replied from the phone app: show it in the chat; the assistant steps back from this chat.
create or replace function public.svc_whatsapp_echo(p_workspace uuid, p_wa_id text, p_msg_id text, p_body text, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev text; cid uuid; conv uuid; mid uuid;
begin
  if coalesce(p_msg_id, '') = '' or coalesce(p_wa_id, '') !~ '^\d{7,15}$' or coalesce(btrim(p_body), '') = '' then return jsonb_build_object('status', 'ignored'); end if;
  if exists (select 1 from messages where workspace_id = p_workspace and provider_message_id = p_msg_id) then return jsonb_build_object('status', 'duplicate'); end if;
  prev := private.sys_on();
  cid := private.wa_contact(p_workspace, p_wa_id, null);
  conv := private.wa_conversation(p_workspace, cid);
  insert into messages(workspace_id, conversation_id, direction, body, status, provider_message_id, created_at)
    values (p_workspace, conv, 'out', left(p_body, 4096), 'sent', p_msg_id, least(coalesce(p_at, now()), now()))
    on conflict (workspace_id, provider_message_id) do nothing returning id into mid;
  if mid is not null then
    update conversations set handled_by = 'human', ai_answered_to = mid, status = case when status = 'closed' then 'open' else status end where id = conv;
    update whatsapp_numbers set last_sent_at = now() where workspace_id = p_workspace;
  end if;
  perform private.sys_restore(prev);
  return jsonb_build_object('status', case when mid is null then 'duplicate' else 'saved' end, 'message', mid);
end $$;

-- The business disconnected Bizriva from the phone app (or Meta removed us).
create or replace function public.svc_whatsapp_partner_removed(p_waba text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_numbers set active = false, last_error = left(coalesce(p_reason, 'Disconnected in the WhatsApp Business app'), 500) where waba_id = p_waba and via = 'partner';
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_whatsapp_keys_by_waba(text)', 'svc_meta_platform()', 'svc_whatsapp_partner_connect(uuid, uuid, text, text, text, text, boolean, text)',
    'svc_whatsapp_sync_requested(uuid, text)', 'svc_whatsapp_history(uuid, int, jsonb)', 'svc_whatsapp_history_error(uuid, text, text)',
    'svc_whatsapp_contacts(uuid, jsonb)', 'svc_whatsapp_echo(uuid, text, text, text, timestamptz)', 'svc_whatsapp_partner_removed(text, text)',
    'svc_whatsapp_verify(text)', 'svc_whatsapp_keys(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function private.wa_contact(uuid, text, text) from public, anon, authenticated;
