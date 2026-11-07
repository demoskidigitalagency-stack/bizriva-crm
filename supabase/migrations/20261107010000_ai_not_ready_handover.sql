-- Bizriva CRM — no customer waits on an AI that can't answer (2026-11-07).
--
-- When a customer writes in a chat the AI is handling, but the AI can't answer
-- — no AI key added, the AI assistant switched off, or the trial/plan has
-- ended — the chat goes straight to the team (and is assigned to the on-duty
-- agent with the fewest open chats), instead of sitting unassigned.
-- Customer chats use the business's own AI key only; Bizriva's key is for the planner.

create or replace function private.ai_ready(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((w.settings -> 'agent' ->> 'enabled')::boolean, true)
     and private.plan_active(w.id)
     and exists (select 1 from ai_keys k where k.workspace_id = w.id and k.active)
  from workspaces w where w.id = ws;
$$;

create or replace function private.handover_if_ai_not_ready() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if new.direction = 'in' and not coalesce(private.ai_ready(new.workspace_id), false)
     and exists (select 1 from conversations c where c.id = new.conversation_id and c.handled_by = 'ai' and c.status <> 'closed') then
    prev := private.sys_on();
    update conversations set handled_by = 'human' where id = new.conversation_id and handled_by = 'ai';
    perform private.sys_restore(prev);
  end if;
  return null;
end $$;
create trigger handover_if_ai_not_ready after insert on public.messages for each row execute function private.handover_if_ai_not_ready();
grant execute on function private.handover_if_ai_not_ready() to authenticated, service_role;
