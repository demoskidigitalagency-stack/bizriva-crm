-- Tailor and fashion pack (StitchBook idea), switched on per business:
--   measurements per client (several sets: "Agbada", "Gown"…), garment jobs that move
--   booked → cutting → sewing → fitting → finishing → ready → delivered, fabric stock in yards
--   (taken off automatically when a job reaches cutting), and group orders (aso-ebi / weddings).
create table if not exists public.tailor_fabrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  colour text check (colour is null or length(colour) <= 60),
  yards numeric not null default 0 check (yards >= 0),
  cost_per_yard numeric not null default 0 check (cost_per_yard >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.tailor_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  event_date date,
  fabric_id uuid references public.tailor_fabrics(id) on delete set null,
  price_each numeric not null default 0 check (price_each >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create table if not exists public.tailor_measurements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  label text not null default 'General' check (length(btrim(label)) between 1 and 60),
  unit text not null default 'in' check (unit in ('in', 'cm')),
  vals jsonb not null default '{}' check (jsonb_typeof(vals) = 'object'),
  notes text check (notes is null or length(notes) <= 1000),
  taken_at timestamptz not null default now()
);
create table if not exists public.tailor_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  group_id uuid references public.tailor_groups(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  measurement_id uuid references public.tailor_measurements(id) on delete set null,
  garment text not null check (length(btrim(garment)) between 1 and 120),
  fabric_id uuid references public.tailor_fabrics(id) on delete set null,
  fabric_yards numeric not null default 0 check (fabric_yards >= 0),
  fabric_taken boolean not null default false,
  stage text not null default 'booked' check (stage in ('booked', 'cutting', 'sewing', 'fitting', 'finishing', 'ready', 'delivered', 'cancelled')),
  due_date date,
  price numeric not null default 0 check (price >= 0),
  deposit numeric not null default 0 check (deposit >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tailor_jobs_ws_stage on public.tailor_jobs(workspace_id, stage);
create index if not exists tailor_measurements_contact on public.tailor_measurements(contact_id);

do $$ declare t text; begin
  foreach t in array array['tailor_fabrics','tailor_groups','tailor_measurements','tailor_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members use %s" on public.%I', t, t);
    execute format('create policy "members use %s" on public.%I for select using (private.is_member(workspace_id))', t, t);
    execute format('drop policy if exists "members add %s" on public.%I', t, t);
    execute format('create policy "members add %s" on public.%I for insert with check (private.is_member(workspace_id))', t, t);
    execute format('drop policy if exists "members edit %s" on public.%I', t, t);
    execute format('create policy "members edit %s" on public.%I for update using (private.is_member(workspace_id)) with check (private.is_member(workspace_id))', t, t);
    execute format('drop policy if exists "owners delete %s" on public.%I', t, t);
    execute format('create policy "owners delete %s" on public.%I for delete using (private.has_role(workspace_id, array[''owner'',''manager'']::member_role[]))', t, t);
  end loop;
end $$;

-- Cutting starts: take the job's fabric off stock once; cancelled before delivery: put it back.
create or replace function private.tailor_job_fabric() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.fabric_id is not null and new.fabric_yards > 0 and not new.fabric_taken
     and new.stage in ('cutting', 'sewing', 'fitting', 'finishing', 'ready', 'delivered') then
    update tailor_fabrics set yards = greatest(0, yards - new.fabric_yards) where id = new.fabric_id and workspace_id = new.workspace_id;
    new.fabric_taken := true;
  elsif new.fabric_taken and new.stage = 'cancelled' and tg_op = 'UPDATE' and old.stage <> 'cancelled' then
    update tailor_fabrics set yards = yards + new.fabric_yards where id = new.fabric_id and workspace_id = new.workspace_id;
    new.fabric_taken := false;
  end if;
  return new;
end $$;
drop trigger if exists tailor_job_fabric on public.tailor_jobs;
create trigger tailor_job_fabric before insert or update on public.tailor_jobs for each row execute function private.tailor_job_fabric();

-- A group order: one job per member, same garment / fabric / price.
create or replace function public.tailor_group_add(p_group uuid, p_contacts uuid[], p_garment text, p_yards numeric, p_due date)
returns integer language plpgsql security definer set search_path = public as $$
declare g record; n int;
begin
  select * into g from tailor_groups where id = p_group;
  if g.id is null or not private.is_member(g.workspace_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into tailor_jobs(workspace_id, contact_id, group_id, garment, fabric_id, fabric_yards, price, due_date)
    select g.workspace_id, k.id, g.id, coalesce(nullif(btrim(p_garment), ''), g.name), g.fabric_id, greatest(0, coalesce(p_yards, 0)), g.price_each, coalesce(p_due, g.event_date)
    from contacts k where k.id = any(p_contacts) and k.workspace_id = g.workspace_id
      and not exists (select 1 from tailor_jobs j where j.group_id = g.id and j.contact_id = k.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.tailor_group_add(uuid, uuid[], text, numeric, date) from public, anon;
grant execute on function public.tailor_group_add(uuid, uuid[], text, numeric, date) to authenticated;
grant select, insert, update, delete on public.tailor_fabrics, public.tailor_groups, public.tailor_measurements, public.tailor_jobs to authenticated;
