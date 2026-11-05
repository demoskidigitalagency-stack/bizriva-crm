-- Payments inside the chat (2026-11-05): provider link, one account number per
-- customer, payment requests, provider notifications, settlement and splits.
-- Provider secret keys live in Vercel/Supabase Vault, never in these tables.

create table public.payment_providers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('paystack', 'flutterwave', 'monnify')),
  key_secret_id uuid, -- vault.secrets id
  methods jsonb not null default '{"transfer": true, "link": true, "cod": true}'::jsonb,
  auto_receipt boolean not null default true,
  auto_confirm boolean not null default true,
  connected_at timestamptz not null default now()
);

create table public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null,
  bank_name text not null,
  account_number text not null check (account_number ~ '^\d{10}$'),
  account_name text not null,
  provider_ref text,
  created_at timestamptz not null default now(),
  unique (workspace_id, contact_id, provider),
  unique (provider, account_number)
);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  amount numeric(14,2) not null check (amount > 0),
  methods text[] not null,
  link_url text,
  status text not null default 'sent' check (status in ('sent', 'paid', 'part_paid', 'expired')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.payment_requests (workspace_id, order_id);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  provider_ref text not null,
  method text not null check (method in ('transfer', 'card', 'ussd')),
  amount numeric(14,2) not null,
  payer_name text,
  paid_into text,
  contact_id uuid references public.contacts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  status text not null check (status in ('matched', 'part', 'over', 'unmatched')),
  settled_to jsonb not null default '[]'::jsonb,
  receipt_no text,
  raw jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_ref) -- a notification retried by the provider is applied once
);
create index on public.payment_events (workspace_id, received_at desc);
create index payment_events_unmatched on public.payment_events (workspace_id) where status = 'unmatched';

create table public.settlement_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  bank_name text not null,
  account_number text not null check (account_number ~ '^\d{10}$'),
  account_name text not null,
  provider_subaccount text, -- Paystack subaccount / Flutterwave subaccount / Monnify sub-account code
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index settlement_one_default on public.settlement_accounts (workspace_id) where is_default;

create table public.split_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null default 'all',
  account_id uuid not null references public.settlement_accounts(id) on delete cascade,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100)
);

alter table public.payment_providers enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_events enable row level security;
alter table public.settlement_accounts enable row level security;
alter table public.split_rules enable row level security;

-- Money settings: owners, managers and finance only.
create policy "money roles manage provider" on public.payment_providers for all
  using (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]));
create policy "money roles manage settlement" on public.settlement_accounts for all
  using (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]));
create policy "money roles manage splits" on public.split_rules for all
  using (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]));
-- Everyone in the business can see accounts, requests and payments; sales can send requests.
create policy "members read customer accounts" on public.customer_accounts for select using (private.is_member(workspace_id));
create policy "members manage payment requests" on public.payment_requests for all
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy "members read payments" on public.payment_events for select using (private.is_member(workspace_id));
create policy "money roles match payments" on public.payment_events for update
  using (private.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]));
