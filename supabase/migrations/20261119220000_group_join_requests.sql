-- Group join requests: for groups where the business is an admin, the WhatsApp server lists who asked
-- to join (wa_groups.requests); the owner approves or rejects in Bizriva (wa_group_actions), and the
-- server carries it out within ~20 seconds.
alter table public.wa_groups add column if not exists requests jsonb not null default '[]';

create table if not exists public.wa_group_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_jid text not null check (group_jid ~ '^[0-9-]+@g\.us$'),
  participant text,
  action text not null check (action in ('approve', 'reject', 'refresh')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'done', 'failed')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.wa_group_actions enable row level security;
create policy "members see group actions" on public.wa_group_actions for select using (private.is_member(workspace_id));
grant select on public.wa_group_actions to authenticated;

create or replace function public.svc_wa_group_requests(p_link uuid, p_groups jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return; end if;
  update wa_groups g set requests = coalesce(x.requests, '[]') from jsonb_to_recordset(coalesce(p_groups, '[]')) as x(jid text, requests jsonb)
    where g.workspace_id = ws and g.jid = x.jid;
end $$;

create or replace function public.svc_wa_group_actions_claim(p_link uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ws uuid; out jsonb;
begin
  select workspace_id into ws from wa_links where id = p_link;
  with picked as (
    select id from wa_group_actions where workspace_id = ws and status = 'queued' order by created_at limit 30 for update skip locked
  ), upd as (update wa_group_actions a set status = 'sending' from picked where a.id = picked.id returning a.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'group_jid', group_jid, 'participant', participant, 'action', action)), '[]') into out from upd;
  return out;
end $$;

create or replace function public.svc_wa_group_action_result(p_id uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update wa_group_actions set status = case when p_error is null then 'done' else 'failed' end, error = left(p_error, 300), done_at = now() where id = p_id;
$$;
revoke execute on function public.svc_wa_group_requests(uuid, jsonb), public.svc_wa_group_actions_claim(uuid), public.svc_wa_group_action_result(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_wa_group_requests(uuid, jsonb), public.svc_wa_group_actions_claim(uuid), public.svc_wa_group_action_result(uuid, text) to service_role;

-- Owner/manager: approve or reject one or more requests, or ask the server to check again.
create or replace function public.wa_group_request_action(p_workspace uuid, p_group text, p_participants text[], p_action text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; p text;
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject', 'refresh') then raise exception 'Unknown action'; end if;
  if not exists (select 1 from wa_groups where workspace_id = p_workspace and jid = p_group and is_admin) then raise exception 'You need to be an admin of that group'; end if;
  if p_action = 'refresh' then
    insert into wa_group_actions(workspace_id, group_jid, action, created_by) values (p_workspace, p_group, 'refresh', auth.uid()); return 1;
  end if;
  foreach p in array coalesce(p_participants, '{}') loop
    insert into wa_group_actions(workspace_id, group_jid, participant, action, created_by) values (p_workspace, p_group, p, p_action, auth.uid());
    n := n + 1;
  end loop;
  -- Hide them from the list straight away; the next check brings back any that didn't go through.
  update wa_groups set requests = coalesce((select jsonb_agg(r) from jsonb_array_elements(requests) r where not (r ->> 'jid' = any(p_participants))), '[]')
    where workspace_id = p_workspace and jid = p_group;
  return n;
end $$;
grant execute on function public.wa_group_request_action(uuid, text, text[], text) to authenticated;
