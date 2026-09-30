-- Platform administration must be server-authorized, not controlled by a client-side email comparison.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and enabled = true
  );
$$;

revoke all on public.platform_admins from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'is_platform_admin'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'is_platform_admin function missing';
  end if;
end $$;
