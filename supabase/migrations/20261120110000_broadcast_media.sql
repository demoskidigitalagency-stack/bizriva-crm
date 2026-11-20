-- Broadcasts with photos and videos: campaigns.media = [{path, kind, name}] (files in chat-media, from
-- the Media Library). Each person gets the files in order; the message text is the caption on the
-- first one. Without media, the text goes on its own as before.
alter table public.campaigns add column if not exists media jsonb not null default '[]'
  check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 5);

create or replace function private.campaign_send(c campaigns) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k record; conv uuid; inwin boolean; mid uuid; first_id uuid; m jsonb; i int; txt text;
  linked boolean := exists (select 1 from wa_links l where l.workspace_id = c.workspace_id and l.status = 'connected');
begin
  for k in select * from private.campaign_targets(c) loop
    conv := private.wa_conversation(c.workspace_id, k.contact_id);
    select coalesce(last_inbound_at > now() - interval '24 hours', false) into inwin from conversations where id = conv;
    if not inwin and coalesce(c.template_name, '') = '' and not (linked and (nullif(btrim(c.body), '') is not null or jsonb_array_length(c.media) > 0)) then
      insert into campaign_recipients(campaign_id, workspace_id, contact_id, skipped_reason) values (c.id, c.workspace_id, k.contact_id, 'needs_template') on conflict do nothing;
      continue;
    end if;
    txt := nullif(replace(coalesce(c.body, ''), '{{name}}', k.first), '');
    first_id := null; i := 0;
    for m in select * from jsonb_array_elements(c.media) loop
      insert into messages(workspace_id, conversation_id, direction, body, status, purpose, media_path, media_kind, media_name)
        values (c.workspace_id, conv, 'out', case when i = 0 then txt end, 'queued', 'marketing', m ->> 'path', m ->> 'kind', left(m ->> 'name', 200))
        returning id into mid;
      if first_id is null then first_id := mid; end if;
      i := i + 1;
    end loop;
    if first_id is null then
      insert into messages(workspace_id, conversation_id, direction, body, status, template_name, purpose)
        values (c.workspace_id, conv, 'out', txt, 'queued', case when inwin or coalesce(c.template_name, '') = '' then null else c.template_name end, 'marketing')
        returning id into first_id;
    end if;
    insert into campaign_recipients(campaign_id, workspace_id, contact_id, message_id) values (c.id, c.workspace_id, k.contact_id, first_id) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.campaign_send(campaigns) from public, anon, authenticated;
