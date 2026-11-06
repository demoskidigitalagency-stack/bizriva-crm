-- Bizriva CRM — tasks, lead outcomes and merging duplicate customers on real data (2026-11-06).
-- Notes and logged calls go in the append-only activity_log (entity 'contact').

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  type text not null default 'general' check (type in ('follow_up', 'call', 'delivery_check', 'payment_chase', 'general')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'done', 'snoozed', 'cancelled')),
  due_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.tasks (workspace_id, status, due_at);
alter table public.tasks enable row level security;
create policy "members read tasks" on public.tasks for select to authenticated using (private.is_member(workspace_id));
create policy "members add tasks" on public.tasks for insert to authenticated with check (private.is_member(workspace_id));
create policy "members update tasks" on public.tasks for update to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy "owners and managers delete tasks" on public.tasks for delete to authenticated using (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create trigger guard_same_ws before insert or update on public.tasks for each row execute function private.guard_same_ws('contact_id', 'contacts');

-- Who made it is set by the server; the assignee must be on the team; done time is stamped.
create or replace function private.guard_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
  else new.created_by := old.created_by; new.created_at := old.created_at; new.workspace_id := old.workspace_id; end if;
  if new.assigned_to is not null and not exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = new.assigned_to) then
    raise exception 'The task must go to someone on the team' using errcode = '23503';
  end if;
  new.done_at := case when new.status = 'done' then coalesce(new.done_at, now()) end;
  return new;
end $$;
create trigger guard_tasks before insert or update on public.tasks for each row execute function private.guard_tasks();
grant execute on function private.guard_tasks() to authenticated, service_role;

alter table public.leads add column outcome text check (outcome in ('no_response', 'follow_up', 'nurture', 'lost', 'disqualified'));

-- Merge duplicates into one customer. Owners and managers only; everything moves, nothing is lost.
create or replace function public.merge_contacts(p_workspace uuid, p_keep uuid, p_merge uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; t text; r record; prev text; n int;
begin
  if not private.has_role(p_workspace, array['owner','manager']::member_role[]) then
    raise exception 'Only an owner or a manager can merge customers' using errcode = '42501';
  end if;
  if not exists (select 1 from contacts where id = p_keep and workspace_id = p_workspace) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select array_agg(id) into ids from contacts where workspace_id = p_workspace and id = any(p_merge) and id <> p_keep;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return 0; end if;
  prev := private.sys_on();
  -- Customer totals add up.
  insert into customers(workspace_id, contact_id, first_order_at, lifetime_value, refused_deliveries)
    select p_workspace, p_keep, min(first_order_at), coalesce(sum(lifetime_value), 0), coalesce(sum(refused_deliveries), 0) from customers where contact_id = any(ids || p_keep)
    having count(*) > 0
    on conflict (contact_id) do update set first_order_at = excluded.first_order_at, lifetime_value = excluded.lifetime_value, refused_deliveries = excluded.refused_deliveries;
  delete from customers where contact_id = any(ids);
  -- Everything else moves; a row that would duplicate one the kept customer already has is dropped.
  foreach t in array array['contact_identities','leads','conversations','orders','consents','payments','order_form_submissions','complaints',
    'calendar_events','contact_facts','connection_events','customer_accounts','payment_requests','payment_events','campaign_recipients','tasks'] loop
    for r in execute format('select ctid as rid from public.%I where contact_id = any($1)', t) using ids loop
      begin
        execute format('update public.%I set contact_id = $1 where ctid = $2', t) using p_keep, r.rid;
      exception when unique_violation then
        execute format('delete from public.%I where ctid = $1', t) using r.rid;
      end;
    end loop;
  end loop;
  update contacts k set tags = (select coalesce(array_agg(distinct x), '{}') from contacts c, unnest(c.tags) x where c.id = any(ids || p_keep)),
    phone = coalesce(k.phone, (select phone from contacts where id = any(ids) and phone is not null limit 1)),
    email = coalesce(k.email, (select email from contacts where id = any(ids) and email is not null limit 1)),
    address = coalesce(k.address, (select address from contacts where id = any(ids) and address is not null limit 1)),
    updated_at = now()
  where k.id = p_keep;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    select p_workspace, auth.uid(), 'contact', p_keep, 'merged', jsonb_build_object('count', n, 'names', jsonb_agg(coalesce(name, phone))) from contacts where id = any(ids);
  delete from contacts where id = any(ids);
  perform private.sys_restore(prev);
  return n;
end $$;
revoke execute on function public.merge_contacts(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.merge_contacts(uuid, uuid, uuid[]) to authenticated;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.activity_log;
