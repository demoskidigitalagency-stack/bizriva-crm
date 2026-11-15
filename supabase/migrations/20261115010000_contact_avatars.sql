-- Bizriva CRM — customers' WhatsApp profile pictures (2026-11-15).
--
-- The linked-device server fetches a customer's profile picture when they write (at most once a
-- week) and, after connecting, for customers who don't have one yet. The picture is kept in the
-- business's private folder (chat-media/<workspace>/avatars/<contact>.jpg). Only pictures the person
-- shows publicly (or to the business's contacts) can be fetched; the rest stay as initials.

alter table public.contacts add column if not exists avatar_path text;
alter table public.contacts add column if not exists avatar_checked_at timestamptz;

-- The contact for this phone, if its picture hasn't been checked in the last 7 days.
create or replace function public.svc_wa_avatar_due(p_link uuid, p_phone text) returns uuid
language sql stable security definer set search_path = public as $$
  select k.id from wa_links l
  join contact_identities ci on ci.workspace_id = l.workspace_id and ci.channel = 'whatsapp' and ci.external_id = p_phone
  join contacts k on k.id = ci.contact_id
  where l.id = p_link and (k.avatar_checked_at is null or k.avatar_checked_at < now() - interval '7 days')
  limit 1;
$$;

create or replace function public.svc_wa_avatar(p_link uuid, p_contact uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; prev text;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return; end if;
  if p_path is not null and p_path <> ws::text || '/avatars/' || p_contact::text || '.jpg' then
    raise exception 'Picture is outside this business''s folder' using errcode = '42501';
  end if;
  prev := private.sys_on();
  update contacts set avatar_path = coalesce(p_path, avatar_path), avatar_checked_at = now() where id = p_contact and workspace_id = ws;
  perform private.sys_restore(prev);
end $$;

-- Phones of customers never checked, newest chats first (personal contacts too: it's their picture, not a message).
create or replace function public.svc_wa_avatar_todo(p_link uuid, p_limit int) returns setof text
language sql stable security definer set search_path = public as $$
  select ci.external_id from wa_links l
  join contact_identities ci on ci.workspace_id = l.workspace_id and ci.channel = 'whatsapp'
  join contacts k on k.id = ci.contact_id
  left join conversations c on c.contact_id = k.id
  where l.id = p_link and k.avatar_checked_at is null and ci.external_id ~ '^\d{7,15}$'
  group by ci.external_id
  order by max(c.last_inbound_at) desc nulls last
  limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function public.svc_wa_avatar_due(uuid, text), public.svc_wa_avatar(uuid, uuid, text), public.svc_wa_avatar_todo(uuid, int) from public, anon, authenticated;
grant execute on function public.svc_wa_avatar_due(uuid, text), public.svc_wa_avatar(uuid, uuid, text), public.svc_wa_avatar_todo(uuid, int) to service_role;
