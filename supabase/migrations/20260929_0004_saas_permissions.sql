-- SaaS permissions, billing metadata and platform administration

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  system_role boolean not null default false,
  created_at timestamptz not null default now(),
  unique(workspace_id, slug)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  resource text not null,
  action text not null,
  scope text not null default 'workspace',
  unique(role_id, resource, action, scope)
);

alter table public.workspace_members add column if not exists role_id uuid references public.roles(id) on delete set null;
alter table public.workspace_members add column if not exists team_id uuid;
alter table public.workspace_members add column if not exists branch_ids uuid[] not null default '{}';

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true,
  entitlements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_id uuid references public.plans(id),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric text not null,
  quantity numeric not null default 1,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists usage_events_workspace_metric_idx on public.usage_events(workspace_id,metric,occurred_at);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_feature_flags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  feature_flag_id uuid not null references public.feature_flags(id) on delete cascade,
  enabled boolean not null,
  primary key(workspace_id,feature_flag_id)
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.platform_admins where user_id=auth.uid());
$$;

create or replace function public.has_permission(
  p_workspace uuid,
  p_resource text,
  p_action text
) returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.workspace_members wm
    join public.role_permissions rp on rp.role_id=wm.role_id
    where wm.workspace_id=p_workspace
      and wm.user_id=auth.uid()
      and wm.active=true
      and rp.resource=p_resource
      and rp.action=p_action
  )
  or exists(
    select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace
      and wm.user_id=auth.uid()
      and wm.active=true
      and wm.role='owner'
  );
$$;

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.workspace_feature_flags enable row level security;
alter table public.platform_admins enable row level security;

create policy "members read roles" on public.roles for select using(public.is_workspace_member(workspace_id));
create policy "members read role permissions" on public.role_permissions for select using(public.is_workspace_member(workspace_id));
create policy "members read subscriptions" on public.subscriptions for select using(public.is_workspace_member(workspace_id));
create policy "members read usage" on public.usage_events for select using(public.is_workspace_member(workspace_id));
create policy "members read workspace flags" on public.workspace_feature_flags for select using(public.is_workspace_member(workspace_id));

create policy "platform admins read platform admins" on public.platform_admins
for select using(public.is_platform_admin());

insert into public.plans(slug,name,entitlements)
values
  ('starter','Starter','{"users":3,"contacts":5000,"automation_runs":1000}'::jsonb),
  ('growth','Growth','{"users":10,"contacts":50000,"automation_runs":10000}'::jsonb),
  ('commerce','Commerce','{"users":25,"contacts":150000,"automation_runs":50000}'::jsonb),
  ('scale','Scale','{"users":100,"contacts":500000,"automation_runs":250000}'::jsonb)
on conflict(slug) do nothing;
