-- Website, form and store connections (2026-11-05). The intake endpoint
-- (/api/intake/<connection id>) checks the secret, stores the raw event, then
-- creates the lead or order with the service role.

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in ('elementor','gravity','wpforms','cf7','fluent','woocommerce','shopify','google_forms','typeform','jotform','tally','zapier','custom')),
  name text not null,
  secret_hash text not null, -- sha256 of the key; the key itself is shown once
  field_map jsonb not null default '{}'::jsonb,
  create_as text not null default 'order' check (create_as in ('order', 'lead')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_event_at timestamptz
);
create index on public.connections (workspace_id);

create table public.connection_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  status text not null check (status in ('created_order', 'created_lead', 'duplicate', 'failed')),
  summary text not null,
  raw jsonb not null,
  external_id text,
  contact_id uuid references public.contacts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  received_at timestamptz not null default now()
);
create index on public.connection_events (workspace_id, connection_id, received_at desc);
-- The same submission twice (retries, page refreshes) is recorded once.
create unique index connection_events_once on public.connection_events (connection_id, external_id)
  where external_id is not null and status in ('created_order', 'created_lead');

alter table public.connections enable row level security;
alter table public.connection_events enable row level security;
create policy "owners and managers manage connections" on public.connections for all
  using (private.has_role(workspace_id, array['owner','manager']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager']::public.member_role[]));
create policy "members read connection activity" on public.connection_events for select
  using (private.is_member(workspace_id));
