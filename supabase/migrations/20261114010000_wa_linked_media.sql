-- Bizriva CRM — photos, videos, voice notes and documents on a linked WhatsApp number (2026-11-14).
--
-- The linked-device server used to save only "[video]" / "[photo]" as text. It now downloads the
-- file from WhatsApp into the business's private folder (chat-media/<workspace_id>/wa/<message id>.<ext>)
-- and records it on the message — for customers' files and for files the owner sends from the phone.
-- Old (imported) history keeps its text placeholders: WhatsApp doesn't hand those files over again.

create or replace function public.svc_wa_media(p_link uuid, p_message uuid, p_kind text, p_name text, p_path text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return; end if;
  if p_kind is not null and p_kind not in ('image', 'video', 'audio', 'document', 'sticker') then return; end if;
  -- A file may only be recorded inside this business's own wa/ folder.
  if p_path is not null and p_path not like ws::text || '/wa/%' then raise exception 'File is outside this business''s folder' using errcode = '42501'; end if;
  prev := private.sys_on();
  update messages set media_kind = coalesce(p_kind, media_kind), media_name = coalesce(left(p_name, 200), media_name),
    media_path = coalesce(p_path, media_path), media_error = left(p_error, 300)
  where id = p_message and workspace_id = ws;
  perform private.sys_restore(prev);
end $$;

revoke execute on function public.svc_wa_media(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.svc_wa_media(uuid, uuid, text, text, text, text) to service_role;
