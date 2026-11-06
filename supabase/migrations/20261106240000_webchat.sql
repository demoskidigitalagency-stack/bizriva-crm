-- Bizriva CRM — website chat (2026-11-06).
--
-- A business turns on website chat and gets a public key. Its chat bubble
-- (a script tag on their website, or the link /chat/<key>) talks to the
-- webchat Edge Function, which uses these service-only functions:
--   start → a visitor session (a secret token for that browser), a customer
--           record (matched by phone when they give one) and a web chat;
--   send  → the visitor's message lands in the Inbox; the AI answers like on WhatsApp;
--   poll  → the visitor sees the business's replies.
-- Limits: 20 messages a minute per visitor; 300 new visitors an hour per business.
-- Only the token's hash is stored. A visitor only ever sees their own chat.

alter table public.workspaces add column webchat_key text unique check (webchat_key ~ '^[a-z0-9]{20,40}$');

create table public.webchat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.webchat_sessions enable row level security;   -- no policies: service only
create index on public.webchat_sessions (workspace_id, created_at);

-- Owners and managers turn it on (a new key) or off (key removed; the bubble stops working).
create or replace function public.set_webchat(p_workspace uuid, p_on boolean) returns text
language plpgsql security definer set search_path = public as $$
declare k text; prev text;
begin
  if not private.has_role(p_workspace, array['owner','manager']::member_role[]) then raise exception 'Only owners and managers can change website chat' using errcode = '42501'; end if;
  k := case when p_on then coalesce((select webchat_key from workspaces where id = p_workspace), encode(extensions.gen_random_bytes(16), 'hex')) end;
  prev := private.sys_on();
  update workspaces set webchat_key = k where id = p_workspace;
  perform private.sys_restore(prev);
  return k;
end $$;
revoke execute on function public.set_webchat(uuid, boolean) from public, anon;
grant execute on function public.set_webchat(uuid, boolean) to authenticated;

-- Website chat messages are "sent" the moment they're written (the visitor's page collects them).
create or replace function private.webchat_out_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'out' and new.status = 'queued' and exists (select 1 from conversations c where c.id = new.conversation_id and c.channel = 'webchat') then
    new.status := 'sent';
  end if;
  return new;
end $$;
create trigger webchat_out_sent before insert on public.messages for each row execute function private.webchat_out_sent();
grant execute on function private.webchat_out_sent() to authenticated, service_role;

create or replace function private.webchat_session(p_token text) returns webchat_sessions
language sql stable security definer set search_path = public as $$
  select s.* from webchat_sessions s join workspaces w on w.id = s.workspace_id and w.webchat_key is not null
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- The bubble's first call: business name and greeting, nothing private.
create or replace function public.svc_webchat_info(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business', w.name, 'greeting', coalesce(nullif(w.settings -> 'webchat' ->> 'greeting', ''), 'Hi! How can we help you today?'),
    'color', coalesce(w.settings -> 'webchat' ->> 'color', '#16a34a'), 'askPhone', coalesce((w.settings -> 'webchat' ->> 'askPhone')::boolean, true))
  from workspaces w where w.webchat_key = p_key;
$$;

create or replace function public.svc_webchat_start(p_key text, p_token text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w workspaces; cid uuid; conv uuid; prev text; phone text;
begin
  select * into w from workspaces where webchat_key = p_key;
  if w.id is null then return jsonb_build_object('error', 'Chat is turned off'); end if;
  if length(coalesce(p_token, '')) < 32 then return jsonb_build_object('error', 'bad_token'); end if;
  if exists (select 1 from webchat_sessions where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then return jsonb_build_object('ok', true); end if;
  if (select count(*) from webchat_sessions where workspace_id = w.id and created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('error', 'Chat is busy right now — please try again in a few minutes');
  end if;
  if coalesce(btrim(p_name), '') = '' then return jsonb_build_object('error', 'Please tell us your name'); end if;
  phone := nullif(btrim(coalesce(p_phone, '')), '');
  if phone is not null and length(private.phone_key(phone)) < 10 then return jsonb_build_object('error', 'That phone number looks incomplete'); end if;
  prev := private.sys_on();
  cid := private.find_or_add_contact(w.id, left(btrim(p_name), 120), phone, null, null, null, null);
  insert into conversations(workspace_id, contact_id, channel) values (w.id, cid, 'webchat') returning id into conv;
  insert into webchat_sessions(workspace_id, contact_id, conversation_id, token_hash)
    values (w.id, cid, conv, encode(extensions.digest(p_token, 'sha256'), 'hex'));
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svc_webchat_send(p_token text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s webchat_sessions; prev text; mid uuid; words text[]; body text := left(btrim(coalesce(p_text, '')), 2000);
begin
  s := private.webchat_session(p_token);
  if s.id is null then return jsonb_build_object('error', 'expired'); end if;
  if body = '' then return jsonb_build_object('error', 'empty'); end if;
  if (select count(*) from messages where conversation_id = s.conversation_id and direction = 'in' and created_at > now() - interval '1 minute') >= 20 then
    return jsonb_build_object('error', 'You''re sending messages very fast — please wait a moment');
  end if;
  prev := private.sys_on();
  insert into messages(workspace_id, conversation_id, direction, body, status) values (s.workspace_id, s.conversation_id, 'in', body, 'received') returning id into mid;
  update conversations set last_inbound_at = now(), status = case when status = 'closed' then 'open' else status end where id = s.conversation_id;
  update webchat_sessions set last_seen_at = now() where id = s.id;
  select coalesce(array(select upper(jsonb_array_elements_text(settings -> 'optOutKeywords'))), array['STOP']) into words from workspaces where id = s.workspace_id;
  if upper(body) = any(case when cardinality(words) = 0 then array['STOP'] else words end) then
    insert into consents(workspace_id, contact_id, channel, category, granted, source, evidence) values (s.workspace_id, s.contact_id, 'webchat', 'marketing', false, 'customer wrote ' || upper(body) || ' in website chat', mid::text);
  end if;
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true, 'id', mid);
end $$;

-- Messages in the visitor's chat after a moment (their own and the business's), oldest first.
create or replace function public.svc_webchat_poll(p_token text, p_after timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s webchat_sessions;
begin
  s := private.webchat_session(p_token);
  if s.id is null then return jsonb_build_object('error', 'expired'); end if;
  update webchat_sessions set last_seen_at = now() where id = s.id and last_seen_at < now() - interval '30 seconds';
  return jsonb_build_object('ok', true, 'messages', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'from', case when m.direction = 'in' then 'you' else 'us' end, 'text', m.body, 'at', m.created_at,
             'media', case when m.direction = 'out' and m.media_path is not null then jsonb_build_object('path', m.media_path, 'kind', m.media_kind, 'name', m.media_name) end) order by m.created_at)
    from (select * from messages where conversation_id = s.conversation_id and created_at > coalesce(p_after, '-infinity') order by created_at limit 100) m), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_webchat_info(text)', 'svc_webchat_start(text, text, text, text)', 'svc_webchat_send(text, text)', 'svc_webchat_poll(text, timestamptz)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke execute on function private.webchat_session(text) from public, anon, authenticated;
