-- Bizriva CRM — foundation schema (DRAFT, not yet applied)
--
-- Every business table carries workspace_id and is protected by row-level
-- security, so one business can never read another's data (acceptance test 14).
--
-- Brings together:
--   * Bizriva (repo 3): workspace, Contact ≠ Lead ≠ Customer
--   * Sandala (repo 1): saved messages, follow-up rules, dispatch verification, activity log
--   * Kobolink (repo 2): orders, deliveries, riders, COD cash, team roles
--   * Master prompt: 13 lead stages, 10 order statuses, consent, idempotent webhooks
--
-- Lead stages, order statuses and roles are still "Proposed" in the crosswalk.
-- Change the enums below once agreed, before this is applied.

create extension if not exists "pgcrypto";

-- ───────────────────────────── enums ─────────────────────────────
create type public.member_role as enum ('owner', 'manager', 'sales', 'support', 'dispatcher', 'finance');
create type public.channel as enum ('whatsapp', 'messenger', 'instagram', 'sms', 'email', 'webchat', 'tiktok', 'phone');
create type public.lead_stage as enum (
  'new_lead', 'first_contact', 'engaged', 'qualified', 'high_intent', 'negotiating', 'checkout_started',
  'order_created', 'order_confirmed', 'follow_up_required', 'unresponsive', 'lost', 'converted'
);
create type public.conversation_status as enum ('open', 'waiting_customer', 'waiting_agent', 'closed');
create type public.handler as enum ('ai', 'human');
create type public.message_direction as enum ('in', 'out');
create type public.message_status as enum ('queued', 'sent', 'delivered', 'read', 'failed', 'received');
create type public.order_status as enum (
  'pending_verification', 'confirmed', 'processing', 'ready_for_dispatch', 'dispatched', 'in_transit',
  'delivered', 'cancelled', 'refused', 'returned'
);
create type public.payment_method as enum ('cod', 'deposit', 'part_payment', 'online', 'payment_link');
create type public.consent_category as enum ('transactional', 'marketing');

-- ───────────────────────── tenancy & team ─────────────────────────
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'sales',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Security-definer helpers so policies don't recurse into workspace_members.
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.has_role(ws uuid, roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = any(roles));
$$;

-- ─────────────────── people: Contact ≠ Lead ≠ Customer ───────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text,
  phone text,
  email text,
  location text,
  address text,
  landmark text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contacts (workspace_id, phone);

-- One person, many channel identities (prevents duplicates when they switch channels).
create table public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel public.channel not null,
  external_id text not null,
  unique (workspace_id, channel, external_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  stage public.lead_stage not null default 'new_lead',
  score int not null default 0,
  product_interest_id uuid,
  assigned_to uuid references auth.users(id),
  source_channel public.channel,
  ad_campaign_id text, ad_campaign_name text,
  ad_set_id text, ad_set_name text,
  ad_id text, ad_name text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.leads (workspace_id, stage);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  first_order_at timestamptz,
  lifetime_value numeric(14,2) not null default 0,
  refused_deliveries int not null default 0
);

-- ─────────────────────────── conversations ───────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel public.channel not null,
  status public.conversation_status not null default 'open',
  handled_by public.handler not null default 'ai',
  assigned_to uuid references auth.users(id),
  priority boolean not null default false,
  -- WhatsApp 24-hour customer-service window is measured from this.
  last_inbound_at timestamptz,
  summary text,
  created_at timestamptz not null default now()
);
create index on public.conversations (workspace_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  body text,
  media_asset_id uuid,
  template_name text,
  sent_by uuid references auth.users(id), -- null = AI or automation
  status public.message_status not null,
  -- Provider's id; unique so a retried webhook can't create a duplicate (acceptance test 13).
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider_message_id)
);
create index on public.messages (conversation_id, created_at);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ─────────────────────────── catalogue ───────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  description text,
  benefits text,
  price numeric(14,2) not null,
  promo_price numeric(14,2),
  stock int,
  active boolean not null default true,
  restricted_category boolean not null default false, -- Meta commerce policy check
  created_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric(14,2) not null,
  stock int
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  kind text not null check (kind in ('image', 'video', 'document')),
  storage_path text not null,
  bytes bigint,
  checksum text,
  created_at timestamptz not null default now(),
  unique (workspace_id, checksum)
);

create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic text not null, -- company, faq, delivery, refund, payment, promotion, terms, script
  question text,
  answer text not null,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────── orders & COD ───────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ref text not null,
  contact_id uuid not null references public.contacts(id),
  lead_id uuid references public.leads(id),
  conversation_id uuid references public.conversations(id),
  status public.order_status not null default 'pending_verification',
  payment_method public.payment_method not null default 'cod',
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  delivery_fee numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  delivery_address text,
  landmark text,
  preferred_date date,
  customer_confirmed_at timestamptz, -- explicit confirmation, never assumed
  notes text,
  created_at timestamptz not null default now(),
  unique (workspace_id, ref)
);
create index on public.orders (workspace_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(14,2) not null
);

create table public.cod_verifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  risk_score int not null default 0,
  risk_reasons text[] not null default '{}',
  needs_human_review boolean not null default false,
  otp_verified boolean,
  confirmed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rider_id uuid references auth.users(id),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  outcome text check (outcome in ('delivered', 'refused', 'unreachable', 'rescheduled', 'returned')),
  cash_collected numeric(14,2),
  cash_remitted_at timestamptz
);

-- ─────────────────────── automation & consent ───────────────────────
create table public.followup_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  apply_stage public.lead_stage,
  delay_hours int not null,
  max_attempts int not null default 3,
  template_name text, -- required when outside the 24-hour window
  quiet_start time, quiet_end time,
  enabled boolean not null default true
);

create table public.followup_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_id uuid not null references public.followup_rules(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  attempt int not null default 1,
  run_at timestamptz not null,
  state text not null default 'scheduled' check (state in ('scheduled', 'sent', 'cancelled', 'failed')),
  cancel_reason text, -- replied, opted_out, purchased, human_takeover
  unique (rule_id, conversation_id, attempt)
);
create index on public.followup_jobs (state, run_at);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel public.channel not null,
  category public.consent_category not null,
  granted boolean not null,
  source text not null,
  evidence text,
  recorded_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor uuid references auth.users(id), -- null = AI or automation
  entity text not null,
  entity_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ─────────────────────── row-level security ───────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "members read their workspace" on public.workspaces
  for select using (public.is_member(id));
create policy "owners update their workspace" on public.workspaces
  for update using (public.has_role(id, array['owner']::public.member_role[]));

create policy "members see their team" on public.workspace_members
  for select using (public.is_member(workspace_id));
create policy "owners and managers manage the team" on public.workspace_members
  for all using (public.has_role(workspace_id, array['owner','manager']::public.member_role[]))
  with check (public.has_role(workspace_id, array['owner','manager']::public.member_role[]));

-- Same member-only policy on every workspace-scoped table.
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','contact_identities','leads','customers','conversations','messages','webhook_events',
    'products','product_variants','media_assets','knowledge_entries','orders','order_items',
    'cod_verifications','deliveries','followup_rules','followup_jobs','consents','activity_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "workspace members only" on public.%I for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;
