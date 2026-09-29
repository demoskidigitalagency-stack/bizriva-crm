-- Bizriva CRM commerce, growth and operations schema

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  handle text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, handle)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  name text not null,
  country_code text,
  region text,
  city text,
  timezone text not null default 'Africa/Lagos',
  active boolean not null default true
);

alter table public.warehouses add column if not exists branch_id uuid references public.branches(id) on delete set null;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique(workspace_id, sku)
);

create table if not exists public.market_prices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  country_code text not null,
  currency text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  compare_at_minor bigint,
  active boolean not null default true,
  unique(workspace_id, product_id, variant_id, country_code, currency)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  movement_type text not null,
  quantity integer not null,
  reference_type text,
  reference_id uuid,
  reason text,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.order_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.delivery_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  name text not null,
  phone text,
  agent_type text not null default 'internal',
  status text not null default 'available',
  zones text[] not null default '{}',
  capacity integer not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.deliveries add column if not exists delivery_agent_id uuid references public.delivery_agents(id);
alter table public.deliveries add column if not exists delivery_address jsonb not null default '{}'::jsonb;
alter table public.deliveries add column if not exists cod_expected_minor bigint;
alter table public.deliveries add column if not exists currency text;

create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delivery_agent_id uuid references public.delivery_agents(id),
  submitted_by_user_id uuid references auth.users(id),
  currency text not null,
  expected_minor bigint not null default 0,
  submitted_minor bigint not null default 0,
  verified_minor bigint,
  status text not null default 'draft',
  note text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.remittance_items (
  remittance_id uuid not null references public.remittances(id) on delete cascade,
  cod_liability_id uuid not null references public.cod_liabilities(id),
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (remittance_id, cod_liability_id)
);

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  form_type text not null,
  slug text,
  schema jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, slug)
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid references public.forms(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null,
  source text,
  received_at timestamptz not null default now()
);

create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  segment_type text not null default 'smart',
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  campaign_type text not null,
  channel text,
  segment_id uuid references public.segments(id) on delete set null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  trigger_config jsonb not null default '{}'::jsonb,
  graph jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  status text not null default 'running',
  cursor jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, external_event_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null,
  description text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  attributed_order_id uuid references public.orders(id),
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id)
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  order_id uuid references public.orders(id),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.ad_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  external_id text not null,
  parent_external_id text,
  name text,
  status text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique(workspace_id, provider, entity_type, external_id)
);

create table if not exists public.ad_metrics_daily (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  external_id text not null,
  day date not null,
  currency text not null,
  spend_minor bigint not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  orders bigint not null default 0,
  confirmed_orders bigint not null default 0,
  delivered_orders bigint not null default 0,
  revenue_minor bigint not null default 0,
  delivered_revenue_minor bigint not null default 0,
  primary key (workspace_id, provider, external_id, day)
);

create or replace function public.create_workspace_for_current_user(
  workspace_name text,
  workspace_handle text,
  country_code text default 'NG',
  base_currency text default 'NGN'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.workspaces(name, handle, country_code, base_currency)
  values (workspace_name, workspace_handle, country_code, base_currency)
  returning id into new_workspace;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace, auth.uid(), 'owner');

  return new_workspace;
end;
$$;

create or replace function public.reserve_inventory(
  p_workspace uuid,
  p_order uuid,
  p_warehouse uuid,
  p_product uuid,
  p_quantity integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  available integer;
  reservation_id uuid;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;

  select physical - reserved into available
  from public.inventory
  where workspace_id=p_workspace and warehouse_id=p_warehouse and product_id=p_product
  for update;

  if available is null or available < p_quantity then raise exception 'Insufficient stock'; end if;

  update public.inventory
  set reserved=reserved+p_quantity, updated_at=now()
  where workspace_id=p_workspace and warehouse_id=p_warehouse and product_id=p_product;

  insert into public.order_reservations(workspace_id,order_id,warehouse_id,product_id,quantity)
  values(p_workspace,p_order,p_warehouse,p_product,p_quantity)
  returning id into reservation_id;

  insert into public.inventory_movements(workspace_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,actor_user_id)
  values(p_workspace,p_warehouse,p_product,'reserve',p_quantity,'order',p_order,auth.uid());

  return reservation_id;
end;
$$;

create or replace function public.release_order_reservations(p_workspace uuid, p_order uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; released integer := 0;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;
  for r in
    select * from public.order_reservations
    where workspace_id=p_workspace and order_id=p_order and status='reserved'
    for update
  loop
    update public.inventory
    set reserved=greatest(0,reserved-r.quantity), updated_at=now()
    where workspace_id=p_workspace and warehouse_id=r.warehouse_id and product_id=r.product_id;

    update public.order_reservations set status='released', released_at=now() where id=r.id;
    released := released + 1;
  end loop;
  return released;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'businesses','branches','product_variants','market_prices','inventory_movements',
    'order_reservations','delivery_agents','remittances','forms','form_submissions',
    'segments','campaigns','workflows','workflow_runs','expenses','commissions',
    'ad_entities','ad_metrics_daily'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "workspace members select %1$s" on public.%1$I for select using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members insert %1$s" on public.%1$I for insert with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members update %1$s" on public.%1$I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;

alter table public.remittance_items enable row level security;
create policy "workspace members remittance items" on public.remittance_items
for select using (
  exists (
    select 1 from public.remittances r
    where r.id=remittance_id and public.is_workspace_member(r.workspace_id)
  )
);

alter table public.provider_events enable row level security;
create policy "workspace provider event read" on public.provider_events
for select using (workspace_id is not null and public.is_workspace_member(workspace_id));
