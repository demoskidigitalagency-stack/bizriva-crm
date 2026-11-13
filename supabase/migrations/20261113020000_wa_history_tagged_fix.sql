-- svc_wa_history: the "tagged" variable clashed with the wa_links.tagged column when the old chats finished.
create or replace function public.svc_wa_history(p_link uuid, p_threads jsonb, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid; t jsonb; m jsonb; cid uuid; conv uuid; added int := 0; chats int := 0; n int; last_id uuid; last_imported boolean; n_tagged int;
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
    n_tagged := private.wa_tag_products(ws);
    insert into activity_log(workspace_id, entity, entity_id, action, detail)
      select ws, 'workspace', ws, 'whatsapp_history_imported', jsonb_build_object('messages', history_messages, 'chats', history_chats, 'tagged', n_tagged, 'via', 'linked_device')
      from wa_links where id = p_link;
  end if;
  return jsonb_build_object('added', added, 'chats', chats);
end $$;
