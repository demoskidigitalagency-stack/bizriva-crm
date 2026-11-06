-- Bizriva CRM — photos, videos, voice notes and documents in WhatsApp chats (2026-11-06).
--
-- Files live in a private Storage bucket, one folder per business:
--   chat-media/<workspace_id>/out/...  staff uploads from the Inbox
--   chat-media/<workspace_id>/in/...   customers' files, downloaded from Meta by whatsapp-webhook
-- Only that business's team can read or upload. The WhatsApp sender gives Meta a
-- link that works for one hour.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 16777216, array[
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/3gpp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.media_ws(object_name text) returns uuid
language sql immutable as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.media_ws(text) to authenticated, service_role;

create policy "team reads its chat files" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.is_member(private.media_ws(name)));
-- Staff upload only into their business's out/ folder; nobody changes or removes files from the app.
create policy "team uploads chat files" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and split_part(name, '/', 2) = 'out' and private.is_member(private.media_ws(name)));

alter table public.messages
  add column media_path text check (media_path is null or length(media_path) <= 300),
  add column media_kind text check (media_kind in ('image', 'video', 'audio', 'document', 'sticker')),
  add column media_name text check (length(media_name) <= 200),
  add column wa_media_id text check (length(wa_media_id) <= 100),
  add column media_error text check (length(media_error) <= 300);

-- Staff may attach only their own business's uploads; once saved, files on a message can't be swapped.
create or replace function private.guard_messages() returns trigger
language plpgsql set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if tg_op = 'INSERT' then
    if new.direction = 'in' and not coalesce(new.imported, false) then raise exception 'Customer messages arrive from the channel, not from staff' using errcode = '42501'; end if;
    if new.direction = 'out' then new.status := 'queued'; new.provider_message_id := null; end if;
    new.wa_media_id := null; new.media_error := null;
    if new.media_path is not null then
      if new.direction <> 'out' or new.media_path not like new.workspace_id::text || '/out/%' or new.media_kind is null or new.media_kind = 'sticker' then
        raise exception 'Attach a file you uploaded to this business' using errcode = '42501';
      end if;
    elsif new.media_kind is not null then new.media_kind := null;
    end if;
  else
    if (new.body, new.direction, new.conversation_id, new.status, new.provider_message_id, new.created_at, new.media_path, new.media_kind, new.media_name, new.wa_media_id, new.media_error) is distinct from
       (old.body, old.direction, old.conversation_id, old.status, old.provider_message_id, old.created_at, old.media_path, old.media_kind, old.media_name, old.wa_media_id, old.media_error) then
      raise exception 'Sent messages can''t be edited' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Inbound: the webhook records Meta's media id, then saves the file (or why it couldn't).
create or replace function public.svc_whatsapp_media(p_message uuid, p_media_id text, p_kind text, p_name text, p_path text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  prev := private.sys_on();
  update messages set wa_media_id = coalesce(left(p_media_id, 100), wa_media_id), media_kind = coalesce(p_kind, media_kind), media_name = coalesce(left(p_name, 200), media_name),
    media_path = coalesce(p_path, media_path), media_error = left(p_error, 300)
  where id = p_message and direction = 'in';
  perform private.sys_restore(prev);
end $$;

-- Outbound: the sender now also gets the file to attach (new name; the old one is no longer called).
create or replace function public.svc_whatsapp_claim_media(p_limit int) returns table(
  id uuid, workspace_id uuid, phone_number_id text, token text, to_phone text, body text, template_name text, in_window boolean,
  media_path text, media_kind text, media_name text)
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
    returning m.id, m.workspace_id, m.conversation_id, m.body, m.template_name, m.media_path, m.media_kind, m.media_name
  )
  select u.id, u.workspace_id, w.phone_number_id, t.decrypted_secret,
    coalesce((select ci.external_id from contact_identities ci where ci.contact_id = c.contact_id and ci.channel = 'whatsapp' limit 1), private.phone_key(k.phone)),
    u.body, u.template_name, coalesce(c.last_inbound_at > now() - interval '24 hours', false), u.media_path, u.media_kind, u.media_name
  from upd u join conversations c on c.id = u.conversation_id join contacts k on k.id = c.contact_id
  join whatsapp_numbers w on w.workspace_id = u.workspace_id join vault.decrypted_secrets t on t.id = w.token_secret_id;
  perform private.sys_restore(prev);
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_whatsapp_media(uuid, text, text, text, text, text)', 'svc_whatsapp_claim_media(int)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
