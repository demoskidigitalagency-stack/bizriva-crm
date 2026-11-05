-- Meta Ads link, ads created from Bizriva, and Conversions API events (2026-11-05).
-- Access tokens are never stored in a table: they go into Supabase Vault and
-- only the server (service role) can read them.

create table public.meta_links (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  ad_account_id text not null,
  ad_account_name text,
  pixel_id text,
  token_secret_id uuid, -- vault.secrets id holding the long-lived user/system token
  capi_enabled boolean not null default false,
  capi_when text not null default 'delivered' check (capi_when in ('delivered', 'confirmed')),
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create table public.ad_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  product_id uuid references public.products(id) on delete set null,
  media_ids uuid[] not null default '{}',
  primary_text text not null,
  headline text not null,
  cta text not null check (cta in ('send_whatsapp', 'order_now', 'learn_more')),
  destination text not null check (destination in ('whatsapp', 'order_form')),
  form_id uuid references public.order_forms(id) on delete set null,
  language text not null default 'en',
  audience jsonb not null,
  daily_budget numeric(14,2) not null check (daily_budget >= 1000),
  days int not null check (days between 1 and 90),
  placements text[] not null,
  status text not null default 'draft' check (status in ('draft', 'paused', 'active')),
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.ad_drafts (workspace_id, status);

create table public.capi_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_name text not null default 'Purchase',
  event_id text not null, -- dedupe key sent to Meta
  value numeric(14,2) not null,
  currency text not null default 'NGN',
  sent_at timestamptz,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, order_id, event_name)
);

alter table public.meta_links enable row level security;
alter table public.ad_drafts enable row level security;
alter table public.capi_events enable row level security;
create policy "owners and managers manage the Meta link" on public.meta_links for all
  using (private.has_role(workspace_id, array['owner','manager']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager']::public.member_role[]));
create policy "members see ads; owners and managers change them" on public.ad_drafts for select using (private.is_member(workspace_id));
create policy "owners and managers write ads" on public.ad_drafts for all
  using (private.has_role(workspace_id, array['owner','manager']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager']::public.member_role[]));
create policy "members read sales sent to Meta" on public.capi_events for select using (private.is_member(workspace_id));
