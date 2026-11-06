-- Bizriva CRM — fields the screens need when they read real data (2026-11-06).
alter table public.products
  add column cost numeric(12,2) not null default 0 check (cost >= 0),
  add column reorder_level int not null default 0 check (reorder_level >= 0),
  add column deposit numeric(12,2) not null default 0 check (deposit >= 0);
alter table public.orders add column channel public.channel not null default 'whatsapp';
alter table public.logistics_partners add column vehicle text not null default 'bike' check (vehicle in ('bike', 'car', 'van'));
alter table public.knowledge_entries add column keywords text[] not null default '{}';
alter table public.followup_rules add column message text check (length(message) <= 1000);
-- Everyday business settings (delivery fee, quiet hours, notifications, store, chat…).
-- Security-relevant settings keep their own columns (plan, assignment, commission, after_delivery).
alter table public.workspaces add column settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 65536);

-- Team list with names and emails (auth.users isn't readable by the app).
create or replace function public.workspace_team(p_workspace uuid)
returns table (user_id uuid, role public.member_role, email text, full_name text, on_duty boolean, states text[], monthly_target int, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, u.email::text, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
    m.on_duty, m.states, m.monthly_target, m.created_at
  from workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace and private.is_member(p_workspace);
$$;
revoke execute on function public.workspace_team(uuid) from public, anon;
grant execute on function public.workspace_team(uuid) to authenticated;

-- Members may update their own on-duty switch; owners/managers set everyone's.
create or replace function public.set_on_duty(p_workspace uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (p_user = auth.uid() and private.is_member(p_workspace) or private.has_role(p_workspace, array['owner','manager']::member_role[])) then
    raise exception 'Only you, an owner or a manager can change this' using errcode = '42501';
  end if;
  perform set_config('bizriva.system', 'on', true);
  update workspace_members set on_duty = p_on where workspace_id = p_workspace and user_id = p_user;
  perform set_config('bizriva.system', '', true);
end $$;
revoke execute on function public.set_on_duty(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_on_duty(uuid, uuid, boolean) to authenticated;

-- A confirmed order gets its delivery record straight away, so it shows on the dispatch board.
create or replace function private.ensure_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if new.status in ('confirmed', 'processing') and not exists (select 1 from deliveries where order_id = new.id) then
    prev := private.sys_on();
    insert into deliveries(workspace_id, order_id) values (new.workspace_id, new.id);
    perform private.sys_restore(prev);
  end if;
  return null;
end $$;
create trigger ensure_delivery after insert or update of status on public.orders for each row execute function private.ensure_delivery();
grant execute on function private.ensure_delivery() to authenticated, service_role;
