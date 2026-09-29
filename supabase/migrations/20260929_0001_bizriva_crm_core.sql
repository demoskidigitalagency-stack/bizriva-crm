-- Bizriva CRM core schema
-- Apply to a dedicated Supabase project only. Do not apply to an unrelated Bizriva/KIOSK database.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text not null unique,
  industry text,
  base_currency text not null default 'NGN',
  country_code text not null default 'NG',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  primary_phone text,
  primary_email text,
  country_code text,
  city text,
  lifecycle text not null default 'contact',
  lead_score integer not null default 0,
  owner_user_id uuid references auth.users(id),
  marketing_consent boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_workspace_idx on public.contacts(workspace_id);
create index if not exists contacts_phone_idx on public.contacts(workspace_id, primary_phone);
create index if not exists contacts_email_idx on public.contacts(workspace_id, primary_email);

create table if not exists public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null,
  external_id text not null,
  handle text,
  verified boolean not null default false,
  is_primary boolean not null default false,
  last_seen_at timestamptz,
  unique(workspace_id, channel, external_id)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  stage text not null default 'new_lead',
  outcome text,
  source text,
  campaign text,
  owner_user_id uuid references auth.users(id),
  score integer not null default 0,
  value_minor bigint not null default 0,
  currency text not null default 'NGN',
  next_follow_up_at timestamptz,
  sla_status text not null default 'on_track',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_workspace_stage_idx on public.leads(workspace_id, stage);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null,
  external_thread_id text,
  subject text,
  unread boolean not null default false,
  awaiting_reply boolean not null default false,
  assignee_user_id uuid references auth.users(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('in','out')),
  body text not null default '',
  author_user_id uuid references auth.users(id),
  sent_at timestamptz not null default now()
);

create unique index if not exists messages_external_id_unique on public.messages(workspace_id, external_message_id) where external_message_id is not null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  active boolean not null default true,
  cost_minor bigint not null default 0,
  default_price_minor bigint not null default 0,
  currency text not null default 'NGN',
  created_at timestamptz not null default now(),
  unique(workspace_id, sku)
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  country_code text,
  region text,
  city text,
  active boolean not null default true
);

create table if not exists public.inventory (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  physical integer not null default 0,
  reserved integer not null default 0,
  incoming integer not null default 0,
  damaged integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id),
  check (physical >= 0 and reserved >= 0 and incoming >= 0 and damaged >= 0)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  reference text not null,
  order_status text not null default 'draft',
  fulfilment_status text not null default 'unfulfilled',
  payment_status text not null default 'unpaid',
  source text,
  channel text,
  market_country_code text,
  warehouse_id uuid references public.warehouses(id),
  currency text not null,
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  delivery_fee_minor bigint not null default 0,
  total_minor bigint not null default 0,
  cogs_minor bigint not null default 0,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, reference)
);
create index if not exists orders_workspace_created_idx on public.orders(workspace_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null,
  line_total_minor bigint not null
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  provider_type text not null default 'internal_agent',
  courier_name text,
  assigned_user_id uuid references auth.users(id),
  tracking_ref text,
  status text not null default 'not_scheduled',
  scheduled_for timestamptz,
  delivered_at timestamptz,
  attempts integer not null default 0,
  failure_reason text,
  proof jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid references public.orders(id),
  contact_id uuid references public.contacts(id),
  provider text,
  provider_reference text,
  method text not null,
  status text not null,
  amount_minor bigint not null,
  currency text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id, provider, provider_reference)
);

create table if not exists public.cod_liabilities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id),
  delivery_id uuid references public.deliveries(id),
  collector_user_id uuid references auth.users(id),
  expected_minor bigint not null,
  collected_minor bigint not null default 0,
  remitted_minor bigint not null default 0,
  currency text not null,
  status text not null default 'expected',
  collected_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  assignee_user_id uuid references auth.users(id),
  title text not null,
  task_type text not null default 'general',
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  kind text not null,
  title text not null,
  description text,
  ref_type text,
  ref_id uuid,
  occurred_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  category text not null,
  status text not null default 'disconnected',
  encrypted_config jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, provider)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active = true
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.contacts enable row level security;
alter table public.channel_identities enable row level security;
alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.payments enable row level security;
alter table public.cod_liabilities enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;
alter table public.integrations enable row level security;
alter table public.audit_events enable row level security;

create policy "workspace members read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members read memberships" on public.workspace_members for select using (public.is_workspace_member(workspace_id));

do $$
declare t text;
begin
  foreach t in array array[
    'contacts','channel_identities','leads','conversations','messages','products','warehouses',
    'inventory','orders','order_items','deliveries','payments','cod_liabilities','tasks',
    'activities','integrations','audit_events'
  ]
  loop
    execute format('create policy "workspace members select %1$s" on public.%1$I for select using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members insert %1$s" on public.%1$I for insert with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members update %1$s" on public.%1$I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;
