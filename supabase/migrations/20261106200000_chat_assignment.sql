-- Bizriva CRM — chats go to a person; transfer between teammates (2026-11-06).
--
-- When a chat is handed to the team (the AI hands over, or staff take over) and
-- nobody has it yet, it goes to the on-duty sales or support teammate with the
-- fewest open team chats (owners and managers on duty are the fallback). Only
-- members of the business can be given a chat. Every hand-over and transfer is
-- recorded in the activity log.

create or replace function private.pick_chat_agent(ws uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from workspace_members m
  where m.workspace_id = ws and m.on_duty and m.role in ('sales', 'support', 'manager', 'owner')
  order by case when m.role in ('sales', 'support') then 0 else 1 end,
    (select count(*) from conversations c where c.workspace_id = ws and c.assigned_to = m.user_id and c.handled_by = 'human' and c.status <> 'closed'),
    m.created_at
  limit 1;
$$;

create or replace function private.assign_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and not exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = new.assigned_to) then
    raise exception 'Chats can only go to someone on the team' using errcode = '23503';
  end if;
  if new.handled_by = 'human' and new.assigned_to is null and new.status <> 'closed' then
    new.assigned_to := private.pick_chat_agent(new.workspace_id);
  end if;
  return new;
end $$;
create trigger assign_chat before insert or update of handled_by, assigned_to, status on public.conversations for each row execute function private.assign_chat();
grant execute on function private.assign_chat() to authenticated, service_role;

create or replace function private.log_chat_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    insert into activity_log(workspace_id, entity, entity_id, action, detail)
      values (new.workspace_id, 'conversation', new.id, case when old.assigned_to is null then 'chat_assigned' else 'chat_transferred' end,
        jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;
  return null;
end $$;
create or replace trigger log_chat_assignment after update on public.conversations for each row execute function private.log_chat_assignment();
grant execute on function private.log_chat_assignment() to authenticated, service_role;
