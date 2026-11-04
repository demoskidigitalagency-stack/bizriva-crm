-- Bizriva CRM — tables for the features added on 2026-11-04
-- (Order Forms, deposits and invoices, complaints, calendar, reply library,
-- WhatsApp chat history imports). Same rule as the foundation: every row
-- belongs to one workspace and only its members can touch it.

-- ───────────────────────── reply library ─────────────────────────
create type public.template_category as enum ('utility', 'marketing', 'authentication');
create type public.template_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.template_purpose as enum (
  'enquiry', 'order', 'payment', 'delivery', 'complaint', 'objection', 'follow_up', 'reactivation', 'referral', 'policy'
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{3,60}$'), -- WhatsApp naming rule
  category public.template_category not null default 'utility',
  purpose public.template_purpose,
  language text not null default 'en', -- 'en' English, 'pcm' Nigerian Pidgin
  body text not null,
  status public.template_status not null default 'draft',
  meta_template_id text, -- set once submitted to Meta
  updated_at timestamptz not null default now(),
  unique (workspace_id, name, language),
  -- Marketing templates must tell people how to opt out.
  check (category <> 'marketing' or body ~* 'stop')
);

-- ───────────────────────── money on orders ─────────────────────────
alter table public.orders
  add column amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  add column invoice_no text,
  add column form_id uuid;

create type public.payment_kind as enum ('deposit', 'balance', 'full', 'cod_cash', 'refund');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  kind public.payment_kind not null,
  method text not null, -- bank_transfer, card, ussd, wallet, cash
  amount numeric(14,2) not null check (amount > 0),
  provider_ref text, -- Paystack / Flutterwave reference, unique per workspace
  rider_id uuid,
  remitted_at timestamptz, -- COD cash handed over by the rider
  paid_at timestamptz not null default now(),
  unique (workspace_id, provider_ref)
);
create index on public.payments (workspace_id, order_id);

create unique index orders_invoice_no on public.orders (workspace_id, invoice_no) where invoice_no is not null;

-- ───────────────────────── order forms ─────────────────────────
create table public.order_forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  product_id uuid not null references public.products(id),
  headline text not null,
  banner text,
  -- [{ id, label, qty, price, gift }] — prices are read from here, never from the browser.
  packages jsonb not null check (jsonb_typeof(packages) = 'array' and jsonb_array_length(packages) > 0),
  fields text[] not null default array['name','phone','address','city'],
  pay_on_delivery boolean not null default true,
  meta_pixel boolean not null default false,
  tiktok_pixel boolean not null default false,
  thank_you text not null default 'Thank you! We will call you to confirm.',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.orders
  add constraint orders_form_fk foreign key (form_id) references public.order_forms(id) on delete set null;

create table public.order_form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null references public.order_forms(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  contact_id uuid references public.contacts(id),
  package_id text not null,
  total numeric(14,2) not null,
  region text,
  ad_source text,
  -- Saved before any email is tried, so an order is never lost.
  email_sent_at timestamptz,
  -- One purchase event per order; the event id is the dedupe key sent to Meta/TikTok.
  event_id uuid not null default gen_random_uuid(),
  event_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, event_id)
);
create index on public.order_form_submissions (workspace_id, form_id, created_at desc);

-- Visitors, starts and drop-off per field, counted by the form page.
create table public.order_form_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null references public.order_forms(id) on delete cascade,
  kind text not null check (kind in ('view', 'start', 'drop', 'duplicate_event')),
  field text,
  visitor_id text,
  at timestamptz not null default now()
);
create index on public.order_form_events (workspace_id, form_id, kind);

-- ───────────────────────── complaints ─────────────────────────
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  order_id uuid references public.orders(id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  assigned_to uuid references auth.users(id),
  resolution text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (status = 'open' or resolved_at is not null)
);
create index on public.complaints (workspace_id, status);

-- ───────────────────────── calendar ─────────────────────────
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('callback', 'delivery', 'meeting', 'reminder')),
  starts_at timestamptz not null,
  contact_id uuid references public.contacts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.calendar_events (workspace_id, starts_at);

-- ───────────────────────── WhatsApp chat imports ─────────────────────────
create table public.chat_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  file_name text not null,
  messages_added int not null default 0,
  duplicates_skipped int not null default 0,
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now()
);

-- Imported messages are marked so they never count toward the 24-hour window.
alter table public.messages add column imported boolean not null default false;

-- ───────────────────────── row-level security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'message_templates','payments','order_forms','order_form_submissions','order_form_events',
    'complaints','calendar_events','chat_imports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "workspace members only" on public.%I for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;

-- Only owners, managers and finance may record or change payments.
create policy "money roles write payments" on public.payments as restrictive for insert
  with check (public.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]));
create policy "money roles update payments" on public.payments as restrictive for update
  using (public.has_role(workspace_id, array['owner','manager','finance']::public.member_role[]));
