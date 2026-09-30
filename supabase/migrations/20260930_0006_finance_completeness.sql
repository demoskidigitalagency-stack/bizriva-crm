-- Operational finance completeness: refunds, customer credit, commissions and payouts

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  provider text,
  provider_reference text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  status text not null default 'requested',
  reason text,
  requested_by_user_id uuid references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  currency text not null,
  balance_minor bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique(workspace_id, contact_id, currency)
);

create table if not exists public.customer_credit_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_credit_id uuid not null references public.customer_credits(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  entry_type text not null,
  amount_minor bigint not null,
  order_id uuid references public.orders(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  note text,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payee_type text not null,
  payee_user_id uuid references auth.users(id),
  payee_name text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  status text not null default 'pending',
  provider text,
  provider_reference text,
  scheduled_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  basis text not null default 'delivered_order',
  calculation_type text not null default 'percentage',
  rate numeric(12,4) not null default 0,
  fixed_minor bigint not null default 0,
  currency text,
  role_scope text[],
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.commissions add column if not exists rule_id uuid references public.commission_rules(id) on delete set null;
alter table public.commissions add column if not exists basis text not null default 'delivered_order';

create or replace function public.adjust_customer_credit(
  p_workspace uuid,
  p_contact uuid,
  p_currency text,
  p_amount_minor bigint,
  p_entry_type text,
  p_order uuid default null,
  p_refund uuid default null,
  p_note text default null
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_credit uuid;
  v_balance bigint;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;

  insert into public.customer_credits(workspace_id,contact_id,currency,balance_minor)
  values(p_workspace,p_contact,p_currency,0)
  on conflict(workspace_id,contact_id,currency) do nothing;

  select id,balance_minor into v_credit,v_balance
  from public.customer_credits
  where workspace_id=p_workspace and contact_id=p_contact and currency=p_currency
  for update;

  if v_balance + p_amount_minor < 0 then
    raise exception 'Insufficient customer credit';
  end if;

  update public.customer_credits
  set balance_minor=balance_minor+p_amount_minor,updated_at=now()
  where id=v_credit
  returning balance_minor into v_balance;

  insert into public.customer_credit_entries(
    workspace_id,customer_credit_id,contact_id,entry_type,amount_minor,
    order_id,refund_id,note,actor_user_id
  ) values(
    p_workspace,v_credit,p_contact,p_entry_type,p_amount_minor,
    p_order,p_refund,p_note,auth.uid()
  );

  return v_balance;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'refunds','customer_credits','customer_credit_entries','payouts','commission_rules'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "workspace members select %1$s" on public.%1$I for select using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members insert %1$s" on public.%1$I for insert with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members update %1$s" on public.%1$I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;
