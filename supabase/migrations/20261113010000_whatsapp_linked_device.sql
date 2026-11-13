-- WhatsApp "Linked Device": connect a number the way WhatsApp Web does (pairing code
-- or QR under WhatsApp → Linked devices). Works without Meta's approval, keeps the
-- phone app, and brings in the chats WhatsApp sends to a newly linked device.
-- It is an unofficial connection: the owner accepts the risk before linking.
--
-- The always-on worker (worker/, runs on Railway) holds the connection. It calls the
-- svc_wa_* functions below with the service-role key. The session keys it needs to stay
-- logged in are stored here already encrypted by the worker (WA_SESSION_KEY lives only
-- on the worker), so the database never sees them in the clear.
--
-- Sending: when the business also has an active Meta (Cloud API) number, Meta sends.
-- Otherwise the linked device sends, and only to people who have written to the business.

create table public.wa_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  phone text not null check (phone ~ '^\d{7,15}$'),
  method text not null default 'code' check (method in ('code', 'qr')),
  status text not null default 'pending' check (status in ('pending', 'waiting', 'connected', 'reconnecting', 'logged_out', 'failed', 'unlinking')),
  pairing_code text check (length(pairing_code) <= 16),
  qr text check (length(qr) <= 20000),
  code_at timestamptz,
  wa_name text check (length(wa_name) <= 120),
  history_status text check (history_status in ('syncing', 'done')),
  history_messages int not null default 0,
  history_chats int not null default 0,
  tagged int not null default 0,
  last_seen_at timestamptz,
  last_error text check (length(last_error) <= 300),
  risk_ack_at timestamptz not null,
  risk_ack_by uuid references auth.users(id),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.wa_links enable row level security;
create policy wa_links_read on public.wa_links for select to authenticated
  using (private.has_role(workspace_id, array['owner', 'manager']::member_role[]));
grant select on public.wa_links to authenticated;

create table private.wa_link_auth (
  link_id uuid not null references public.wa_links(id) on delete cascade,
  k text not null check (length(k) <= 300),
  v text not null,
  updated_at timestamptz not null default now(),
  primary key (link_id, k)
);

create table private.wa_worker (
  id boolean primary key default true check (id),
  last_at timestamptz,
  version text,
  links int not null default 0
);
insert into private.wa_worker(id) values (true);

-- 0803… (Nigeria) → 234803…; otherwise digits only.
create or replace function private.wa_phone(p text) returns text language sql immutable set search_path = '' as $$
  select case when d ~ '^0\d{10}$' then '234' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function private.wa_worker_online() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select last_at > now() - interval '90 seconds' from private.wa_worker), false);
$$;

-- ───────────── owner actions ─────────────
create or replace function public.link_whatsapp_device(p_workspace uuid, p_phone text, p_method text, p_risk_ack boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := private.wa_phone(p_phone); cur wa_links;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can link WhatsApp' using errcode = '42501'; end if;
  if not coalesce(p_risk_ack, false) then raise exception 'Tick the box to confirm you understand the risk first'; end if;
  if ph !~ '^\d{10,15}$' then raise exception 'Enter your WhatsApp number with the country code, e.g. 2348031234567'; end if;
  if coalesce(p_method, '') not in ('code', 'qr') then raise exception 'Choose pairing code or QR code'; end if;
  select * into cur from wa_links where workspace_id = p_workspace;
  if cur.id is not null and cur.status in ('connected', 'reconnecting') then raise exception 'A WhatsApp number is already linked — unlink it first'; end if;
  if cur.id is not null then delete from private.wa_link_auth where link_id = cur.id; end if;
  insert into wa_links(workspace_id, phone, method, status, risk_ack_at, risk_ack_by, created_by)
    values (p_workspace, ph, p_method, 'pending', now(), auth.uid(), auth.uid())
  on conflict (workspace_id) do update set phone = excluded.phone, method = excluded.method, status = 'pending', pairing_code = null, qr = null, code_at = null,
    last_error = null, risk_ack_at = now(), risk_ack_by = auth.uid(), connected_at = null, history_status = null;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (p_workspace, auth.uid(), 'workspace', p_workspace, 'whatsapp_device_link_started', jsonb_build_object('method', p_method, 'risk_accepted', true));
  return jsonb_build_object('phone', ph, 'workerOnline', private.wa_worker_online());
end $$;

-- Unlink: the worker logs out of WhatsApp and forgets the session. If the worker is
-- off, the link is removed here and the owner removes the device on the phone.
create or replace function public.unlink_whatsapp_device(p_workspace uuid) returns text
language plpgsql security definer set search_path = public as $$
declare cur wa_links;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can unlink WhatsApp' using errcode = '42501'; end if;
  select * into cur from wa_links where workspace_id = p_workspace;
  if cur.id is null then return 'removed'; end if;
  if cur.status in ('connected', 'reconnecting') and private.wa_worker_online() then
    update wa_links set status = 'unlinking' where id = cur.id;
    return 'unlinking';
  end if;
  delete from wa_links where id = cur.id;
  return case when cur.status in ('connected', 'reconnecting') then 'removed_check_phone' else 'removed' end;
end $$;

create or replace function public.wa_link_overview(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'workerOnline', private.wa_worker_online(),
    'cloudNumber', exists (select 1 from whatsapp_numbers where workspace_id = p_workspace and active),
    'whatsappContacts', (select count(*) from contact_identities where workspace_id = p_workspace and channel = 'whatsapp'),
    'withoutOrder', (select count(*) from contact_identities ci where ci.workspace_id = p_workspace and ci.channel = 'whatsapp'
                      and not exists (select 1 from orders o where o.contact_id = ci.contact_id)));
end $$;

-- ───────────── tag chats by the product they're about ─────────────
-- A product counts when its name (or SKU) appears in the chat, from either side.
-- Adds "Asked about: <product>" tags, sets the lead's product interest if empty,
-- and keeps a "No order yet" tag in step with the customer's orders.
create or replace function private.wa_tag_products(p_workspace uuid) returns int
language plpgsql security definer set search_path = public as $$
declare prev text; n int := 0;
begin
  prev := private.sys_on();
  create temp table if not exists _wa_hits(contact_id uuid, product_id uuid, name text, last_at timestamptz) on commit drop;
  truncate _wa_hits;
  insert into _wa_hits
    select c.contact_id, p.id, p.name, max(m.created_at)
    from messages m
    join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
    join products p on p.workspace_id = m.workspace_id and p.active and length(btrim(p.name)) >= 3
    where m.workspace_id = p_workspace and m.body is not null
      and ((m.body ilike '%' || btrim(p.name) || '%'
            and m.body ~* ('(^|[^[:alnum:]])' || regexp_replace(btrim(p.name), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '($|[^[:alnum:]])'))
        or (length(btrim(coalesce(p.sku, ''))) >= 3 and m.body ilike '%' || btrim(p.sku) || '%'))
    group by c.contact_id, p.id, p.name;

  update contacts k set tags = (select array(select distinct t from unnest(k.tags || h.tags) t order by t)), updated_at = now()
  from (select contact_id, array_agg(distinct 'Asked about: ' || left(name, 80)) as tags from _wa_hits group by contact_id) h
  where k.id = h.contact_id and not (h.tags <@ k.tags);
  get diagnostics n = row_count;

  update leads l set product_interest_id = h.product_id
  from (select distinct on (contact_id) contact_id, product_id from _wa_hits order by contact_id, last_at desc) h
  where l.contact_id = h.contact_id and l.product_interest_id is null;

  update contacts k set tags = array_append(k.tags, 'No order yet'), updated_at = now()
  where k.workspace_id = p_workspace and not ('No order yet' = any(k.tags))
    and exists (select 1 from contact_identities ci where ci.contact_id = k.id and ci.channel = 'whatsapp')
    and not exists (select 1 from orders o where o.contact_id = k.id);
  update contacts k set tags = array_remove(k.tags, 'No order yet'), updated_at = now()
  where k.workspace_id = p_workspace and 'No order yet' = any(k.tags) and exists (select 1 from orders o where o.contact_id = k.id);

  update wa_links set tagged = (select count(distinct contact_id) from _wa_hits) where workspace_id = p_workspace;
  perform private.sys_restore(prev);
  return (select count(distinct contact_id) from _wa_hits);
end $$;

create or replace function public.tag_chats_by_product(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  n := private.wa_tag_products(p_workspace);
  return jsonb_build_object('tagged', n, 'products', (select count(*) from products where workspace_id = p_workspace and active));
end $$;

-- ───────────── for the worker (service role only) ─────────────
-- Heartbeat; returns the links the worker should hold.
create or replace function public.svc_wa_worker_beat(p_version text, p_links int)
returns table(id uuid, workspace_id uuid, phone text, method text, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update private.wa_worker set last_at = now(), version = left(p_version, 40), links = greatest(coalesce(p_links, 0), 0) where private.wa_worker.id;
  return query select l.id, l.workspace_id, l.phone, l.method, l.status from wa_links l where l.status not in ('logged_out', 'failed');
end $$;

-- Update what the owner sees. Keys: status, pairing_code, qr, wa_name, last_error, history_status.
-- The first time a link connects, its old chats start coming in ("syncing"). Returns the history state.
create or replace function public.svc_wa_link_patch(p_link uuid, p_patch jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare st text := p_patch ->> 'status';
begin
  if st is not null and st not in ('pending', 'waiting', 'connected', 'reconnecting', 'logged_out', 'failed') then raise exception 'bad status %', st; end if;
  update wa_links set
    status = coalesce(st, status),
    pairing_code = case when p_patch ? 'pairing_code' then p_patch ->> 'pairing_code' else pairing_code end,
    qr = case when p_patch ? 'qr' then p_patch ->> 'qr' else qr end,
    code_at = case when p_patch ? 'pairing_code' or p_patch ? 'qr' then now() else code_at end,
    wa_name = coalesce(left(p_patch ->> 'wa_name', 120), wa_name),
    last_error = case when p_patch ? 'last_error' then left(p_patch ->> 'last_error', 300) when st = 'connected' then null else last_error end,
    history_status = case when p_patch ? 'history_status' then p_patch ->> 'history_status' when st = 'connected' and history_status is null then 'syncing' else history_status end,
    connected_at = case when st = 'connected' and status <> 'connected' then coalesce(connected_at, now()) else connected_at end,
    last_seen_at = now()
  where id = p_link and status <> 'unlinking';
  if st = 'logged_out' then delete from private.wa_link_auth where link_id = p_link; end if;
  return (select history_status from wa_links where id = p_link);
end $$;

-- After the worker logged out on an unlink request.
create or replace function public.svc_wa_link_gone(p_link uuid) returns void
language sql security definer set search_path = public as $$
  delete from wa_links where id = p_link;
$$;

create or replace function public.svc_wa_auth_all(p_link uuid) returns table(k text, v text)
language sql stable security definer set search_path = public as $$
  select a.k, a.v from private.wa_link_auth a where a.link_id = p_link;
$$;

-- p_items: {"key": "encrypted value" | null (delete)}
create or replace function public.svc_wa_auth_put(p_link uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from private.wa_link_auth a using jsonb_each(p_items) e where a.link_id = p_link and a.k = e.key and jsonb_typeof(e.value) = 'null';
  insert into private.wa_link_auth(link_id, k, v)
    select p_link, e.key, e.value #>> '{}' from jsonb_each(p_items) e where jsonb_typeof(e.value) = 'string'
  on conflict (link_id, k) do update set v = excluded.v, updated_at = now();
end $$;

-- Chats WhatsApp sent to the newly linked device. Saved as imported history: the
-- assistant never answers them and no reminders go out.
-- p_threads: [{ "wa": "2348031234567", "name": "Ada", "messages": [{ "id", "at", "out", "body" }] }]
create or replace function public.svc_wa_history(p_link uuid, p_threads jsonb, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid; t jsonb; m jsonb; cid uuid; conv uuid; added int := 0; chats int := 0; n int; last_id uuid; last_imported boolean; tagged int;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return jsonb_build_object('status', 'gone'); end if;
  prev := private.sys_on();
  for t in select * from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) loop
    if coalesce(t ->> 'wa', '') !~ '^\d{7,15}$' then continue; end if;
    cid := private.wa_contact(ws, t ->> 'wa', left(t ->> 'name', 120));
    conv := private.wa_conversation(ws, cid);
    n := 0;
    for m in select * from jsonb_array_elements(coalesce(t -> 'messages', '[]'::jsonb)) loop
      if coalesce(m ->> 'id', '') = '' or coalesce(btrim(m ->> 'body'), '') = '' then continue; end if;
      insert into messages(workspace_id, conversation_id, direction, body, status, provider_message_id, imported, created_at)
        values (ws, conv, (case when (m ->> 'out')::boolean then 'out' else 'in' end)::message_direction, left(m ->> 'body', 4096),
                case when (m ->> 'out')::boolean then 'sent'::message_status else 'received'::message_status end, m ->> 'id', true,
                least(coalesce(nullif(m ->> 'at', '')::timestamptz, now()), now()))
        on conflict (workspace_id, provider_message_id) do nothing;
      if found then n := n + 1; end if;
    end loop;
    if n > 0 then
      added := added + n; chats := chats + 1;
      select id, imported into last_id, last_imported from messages where conversation_id = conv order by created_at desc limit 1;
      if last_imported then update conversations set ai_answered_to = last_id where id = conv; end if;
    end if;
  end loop;
  update wa_links set history_messages = history_messages + added, history_chats = history_chats + chats,
    history_status = case when p_done or history_status = 'done' then 'done' else 'syncing' end, last_seen_at = now() where id = p_link;
  perform private.sys_restore(prev);
  if p_done then
    tagged := private.wa_tag_products(ws);
    insert into activity_log(workspace_id, entity, entity_id, action, detail)
      select ws, 'workspace', ws, 'whatsapp_history_imported', jsonb_build_object('messages', history_messages, 'chats', history_chats, 'tagged', tagged, 'via', 'linked_device')
      from wa_links where id = p_link;
  end if;
  return jsonb_build_object('added', added, 'chats', chats);
end $$;

-- Names from the phone's address book, for customers already in Bizriva without a name.
-- p_contacts: [{ "phone": "2348031234567", "name": "Ada" }]
create or replace function public.svc_wa_names(p_link uuid, p_contacts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid; n int;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return 0; end if;
  prev := private.sys_on();
  update contacts k set name = left(btrim(c ->> 'name'), 120), updated_at = now()
  from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) c
  join contact_identities ci on ci.workspace_id = ws and ci.channel = 'whatsapp' and ci.external_id = c ->> 'phone'
  where k.id = ci.contact_id and k.name is null and coalesce(btrim(c ->> 'name'), '') <> '';
  get diagnostics n = row_count;
  perform private.sys_restore(prev);
  return n;
end $$;

-- Messages waiting to go out through the linked device. Meta sends instead when the
-- business has an active Cloud API number. Only people who have written to the business
-- are messaged; anyone else fails with the reason (cold messaging gets numbers banned).
create or replace function public.svc_wa_claim(p_link uuid, p_limit int)
returns table(id uuid, to_wa text, body text, media_path text, media_kind text, media_name text, purpose text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text; ws uuid;
begin
  select l.workspace_id into ws from wa_links l where l.id = p_link and l.status = 'connected';
  if ws is null or exists (select 1 from whatsapp_numbers w where w.workspace_id = ws and w.active) then return; end if;
  prev := private.sys_on();
  update messages x set status = 'failed', error = 'This person has never messaged your WhatsApp — a linked number only messages people who wrote to you first'
    from conversations c where c.id = x.conversation_id and c.channel = 'whatsapp' and x.workspace_id = ws and x.direction = 'out' and x.status = 'queued'
      and not exists (select 1 from messages i where i.conversation_id = c.id and i.direction = 'in');
  update messages x set status = 'failed', error = 'Customer opted out of messages'
    from conversations c where c.id = x.conversation_id and c.channel = 'whatsapp' and x.workspace_id = ws and x.direction = 'out' and x.status = 'queued'
      and x.purpose = 'marketing' and private.opted_out(c.contact_id);
  return query
  with picked as (
    select x.id from messages x join conversations c on c.id = x.conversation_id and c.channel = 'whatsapp'
    where x.workspace_id = ws and x.direction = 'out' and x.status = 'queued' and x.send_attempts < 3
      and (x.claimed_at is null or x.claimed_at < now() - interval '10 minutes')
    order by x.created_at limit least(greatest(p_limit, 1), 50)
    for update of x skip locked
  ), upd as (
    update messages x set claimed_at = now(), send_attempts = x.send_attempts + 1 from picked where x.id = picked.id
    returning x.id, x.conversation_id, x.body, x.media_path, x.media_kind, x.media_name, x.purpose
  )
  select u.id,
    coalesce((select ci.external_id from contact_identities ci where ci.contact_id = c.contact_id and ci.channel = 'whatsapp' limit 1), private.phone_key(k.phone)),
    u.body, u.media_path, u.media_kind, u.media_name, u.purpose
  from upd u join conversations c on c.id = u.conversation_id join contacts k on k.id = c.contact_id;
  perform private.sys_restore(prev);
end $$;

-- The SMS fallback leaves alone messages a linked device is about to send.
create or replace function public.svc_sms_claim(p_limit int) returns table(id uuid, workspace_id uuid, to_phone text, body text, api_key text, sender text, route text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text; m messages;
begin
  for m in select x.* from messages x join conversations c on c.id = x.conversation_id and c.channel = 'whatsapp'
           where x.direction = 'out' and x.status = 'queued' and x.purpose = 'service' and x.created_at < now() - interval '2 minutes'
             and not exists (select 1 from whatsapp_numbers w where w.workspace_id = x.workspace_id and w.active)
             and not exists (select 1 from wa_links l where l.workspace_id = x.workspace_id and l.status = 'connected' and private.wa_worker_online())
             and private.sms_on(x.workspace_id)
           limit 200 loop
    perform private.sms_fallback(m, 'WhatsApp isn''t connected — sent by SMS instead');
  end loop;
  prev := private.sys_on();
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

-- ───────────── permissions ─────────────
do $$
declare f text;
begin
  foreach f in array array['svc_wa_worker_beat(text, int)', 'svc_wa_link_patch(uuid, jsonb)', 'svc_wa_link_gone(uuid)', 'svc_wa_auth_all(uuid)',
    'svc_wa_auth_put(uuid, jsonb)', 'svc_wa_history(uuid, jsonb, boolean)', 'svc_wa_names(uuid, jsonb)', 'svc_wa_claim(uuid, int)', 'svc_sms_claim(int)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['link_whatsapp_device(uuid, text, text, boolean)', 'unlink_whatsapp_device(uuid)', 'wa_link_overview(uuid)', 'tag_chats_by_product(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function private.wa_tag_products(uuid) from public, anon, authenticated;
revoke all on function private.wa_worker_online() from public, anon;
grant execute on function private.wa_worker_online() to authenticated, service_role;
