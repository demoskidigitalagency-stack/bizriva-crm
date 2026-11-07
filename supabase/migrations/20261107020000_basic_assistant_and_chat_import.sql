-- Bizriva CRM — free Basic assistant, and old WhatsApp chats into real data (2026-11-07).
--
-- Basic assistant: with no AI key, the assistant still answers (ai-reply runs
-- simple rules: greeting, prices and photos from the catalogue, FAQ answers,
-- step-by-step ordering) and hands anything else to the team. So the AI is
-- "ready" whenever it's switched on and the plan is active; the key only
-- decides between the Basic assistant and the full AI.
--
-- Chat import: owners and managers bring in WhatsApp "Export chat" files. The
-- messages are marked imported: they never open the 24-hour window, never
-- wake the assistant, never start reminders, and never count in response times.

create or replace function private.ai_ready(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((w.settings -> 'agent' ->> 'enabled')::boolean, true) and private.plan_active(w.id)
  from workspaces w where w.id = ws;
$$;

create or replace function private.handover_if_ai_not_ready() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if new.direction = 'in' and not coalesce(new.imported, false) and not coalesce(private.ai_ready(new.workspace_id), false)
     and exists (select 1 from conversations c where c.id = new.conversation_id and c.handled_by = 'ai' and c.status <> 'closed') then
    prev := private.sys_on();
    update conversations set handled_by = 'human' where id = new.conversation_id and handled_by = 'ai';
    perform private.sys_restore(prev);
  end if;
  return null;
end $$;

-- Reminders ignore imported history.
create or replace function private.followup_candidates() returns table(rule_id uuid, workspace_id uuid, conversation_id uuid, contact_id uuid, order_id uuid, since timestamptz)
language sql volatile security definer set search_path = public as $$
  select r.id, r.workspace_id, c.id, c.contact_id, null::uuid, s.since
  from followup_rules r
  join conversations c on c.workspace_id = r.workspace_id and c.channel = 'whatsapp' and c.status <> 'closed'
  cross join lateral (
    select min(m.created_at) as since, bool_or(m.body ~ '₦\s?\d') as priced
    from messages m where m.conversation_id = c.id and m.direction = 'out' and not coalesce(m.imported, false)
      and m.created_at > coalesce((select max(m2.created_at) from messages m2 where m2.conversation_id = c.id and m2.direction = 'in'), '-infinity'::timestamptz)
  ) s
  where r.enabled and s.since is not null
    and (r.trigger = 'no_reply_after_details'
      or (r.trigger = 'no_reply_after_price' and s.priced)
      or (r.trigger = 'checkout_abandoned' and c.checkout is not null))
    and not exists (select 1 from orders o where o.contact_id = c.contact_id and o.created_at > s.since)
  union all
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id, coalesce(d.delivered_at, d.dispatched_at, o.created_at)
  from followup_rules r join orders o on o.workspace_id = r.workspace_id join deliveries d on d.order_id = o.id
  where r.enabled and r.trigger = 'delivery_failed' and d.outcome in ('unreachable', 'rescheduled') and o.status not in ('delivered', 'cancelled', 'returned', 'refused')
  union all
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id, a.last_at
  from followup_rules r join orders o on o.workspace_id = r.workspace_id
  cross join lateral (select max(x.at) as last_at, count(*) filter (where x.outcome in ('no_answer', 'busy')) as missed, bool_or(x.outcome = 'reached') as reached
                      from order_contact_attempts x where x.order_id = o.id) a
  where r.enabled and r.trigger = 'unreachable' and o.status = 'pending_verification' and a.missed >= 2 and not coalesce(a.reached, false)
  union all
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id,
    coalesce((select max(l.created_at) from activity_log l where l.entity = 'order' and l.entity_id = o.id), o.created_at)
  from followup_rules r join orders o on o.workspace_id = r.workspace_id
  where r.enabled and r.trigger = 'order_cancelled' and o.status = 'cancelled' and o.created_at > now() - interval '30 days'
  union all
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id, d.delivered_at + make_interval(days => p.reorder_days)
  from followup_rules r join orders o on o.workspace_id = r.workspace_id join deliveries d on d.order_id = o.id
  cross join lateral (select max(pp.reorder_days) as reorder_days from order_items i join products pp on pp.id = i.product_id where i.order_id = o.id and pp.reorder_days > 0) p
  where r.enabled and r.trigger = 'reorder_due' and o.status = 'delivered' and d.delivered_at is not null and p.reorder_days is not null
    and d.delivered_at + make_interval(days => p.reorder_days) between now() - interval '14 days' and now() + interval '7 days'
    and not exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.created_at > d.delivered_at);
$$;

-- Bring in one exported chat. p_messages: [{ "at": iso, "out": bool, "body": text }] (oldest first, at most 5,000).
create or replace function public.import_chat(p_workspace uuid, p_contact uuid, p_name text, p_phone text, p_city text, p_messages jsonb, p_file text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid; conv uuid; prev text; n_in int; added int; last_id uuid; m jsonb; at timestamptz; mid uuid;
begin
  if not private.has_role(p_workspace, array['owner','manager']::member_role[]) then raise exception 'Only an owner or manager can import chats' using errcode = '42501'; end if;
  if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) = 0 then raise exception 'No messages in that chat'; end if;
  if jsonb_array_length(p_messages) > 5000 then raise exception 'That chat is too long (over 5,000 messages) — export a shorter period'; end if;
  if p_contact is not null then
    select id into cid from contacts where id = p_contact and workspace_id = p_workspace;
    if cid is null then raise exception 'That customer isn''t in this business'; end if;
  else
    if coalesce(btrim(p_name), '') = '' or length(private.phone_key(p_phone)) < 10 then raise exception 'Enter the customer''s name and full phone number'; end if;
  end if;
  prev := private.sys_on();
  if cid is null then cid := private.find_or_add_contact(p_workspace, left(btrim(p_name), 120), p_phone, null, null, nullif(btrim(p_city), ''), null); end if;
  conv := private.wa_conversation(p_workspace, cid);
  n_in := jsonb_array_length(p_messages); added := 0;
  for m in select * from jsonb_array_elements(p_messages) loop
    at := least(coalesce(nullif(m ->> 'at', '')::timestamptz, now()), now());
    if coalesce(btrim(m ->> 'body'), '') = '' then continue; end if;
    if exists (select 1 from messages x where x.conversation_id = conv and x.created_at = at and x.body = left(m ->> 'body', 4096)) then continue; end if;
    insert into messages(workspace_id, conversation_id, direction, body, status, imported, created_at)
      values (p_workspace, conv, (case when (m ->> 'out')::boolean then 'out' else 'in' end)::message_direction, left(m ->> 'body', 4096),
              case when (m ->> 'out')::boolean then 'sent'::message_status else 'received'::message_status end, true, at)
      returning id into mid;
    added := added + 1;
  end loop;
  -- The assistant never answers imported history.
  select id into last_id from messages where conversation_id = conv order by created_at desc limit 1;
  update conversations set ai_answered_to = last_id where id = conv;
  insert into activity_log(workspace_id, entity, entity_id, action, detail)
    values (p_workspace, 'contact', cid, 'chat_imported', jsonb_build_object('file', left(p_file, 200), 'added', added, 'skipped', n_in - added));
  perform private.sys_restore(prev);
  return jsonb_build_object('contact', cid, 'conversation', conv, 'added', added, 'duplicates', n_in - added);
end $$;
revoke execute on function public.import_chat(uuid, uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.import_chat(uuid, uuid, text, text, text, jsonb, text) to authenticated;
