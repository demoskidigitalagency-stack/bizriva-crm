-- Applied to the Bizriva CRM Supabase project (London, xjhzkciowmklxrtwsikm) on 2026-11-05.
-- Policy helpers move to a schema the web API doesn't expose (Supabase security advisor),
-- plus sign-up (create_workspace) and team invitations (workspace_invites, accept_invite).

create schema if not exists private;
alter function public.is_member(uuid) set schema private;
alter function public.has_role(uuid, public.member_role[]) set schema private;
alter function private.is_member(uuid) set search_path = public;
alter function private.has_role(uuid, public.member_role[]) set search_path = public;
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on function private.is_member(uuid) from public, anon;
revoke execute on function private.has_role(uuid, public.member_role[]) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.member_role[]) to authenticated;

-- Sign-up: a new user creates their business and becomes its owner.
create or replace function public.create_workspace(p_name text, p_currency text default 'NGN')
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Business name is required'; end if;
  insert into workspaces(name, currency) values (trim(p_name), coalesce(nullif(p_currency, ''), 'NGN')) returning id into ws;
  insert into workspace_members(workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end $$;
revoke execute on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;

-- Team invitations: owners and managers invite by email with a role.
create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null default 'sales',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
alter table public.workspace_invites enable row level security;
create policy "owners and managers manage invites" on public.workspace_invites
  for all using (private.has_role(workspace_id, array['owner','manager']::public.member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager']::public.member_role[]));

-- The invited person accepts with the token from their link; their sign-in email must match.
create or replace function public.accept_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv workspace_invites;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from workspace_invites where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'This invite is invalid or has expired'; end if;
  if lower(inv.email) <> lower((select email from auth.users where id = auth.uid())) then
    raise exception 'This invite was sent to a different email address';
  end if;
  insert into workspace_members(workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  update workspace_invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end $$;
revoke execute on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

create policy "members see their own memberships" on public.workspace_members
  for select using (user_id = auth.uid());
