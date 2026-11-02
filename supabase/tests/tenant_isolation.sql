-- Tenant isolation check (acceptance test 14, database level).
-- Run against a scratch Postgres after the foundation migration. Outside Supabase,
-- first create auth.users and auth.uid() — see supabase/tests/README.md.
-- Expected: each user sees only their own workspace; the last insert is refused.

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b');
insert into workspaces(id,name) values ('10000000-0000-0000-0000-00000000000a','Shop A'),('10000000-0000-0000-0000-00000000000b','Shop B');
insert into workspace_members values ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','owner'),('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','sales');
insert into contacts(workspace_id,name) values ('10000000-0000-0000-0000-00000000000a','Ada (A)'),('10000000-0000-0000-0000-00000000000b','Bola (B)');
do $$ begin if not exists (select from pg_roles where rolname='app_user') then create role app_user; end if; end $$;
grant usage on schema public, auth to app_user; grant select, insert on all tables in schema public to app_user; grant select on auth.users to app_user;
set role app_user;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'user A sees: ' || string_agg(name, ', ') from contacts;
select 'user A sees workspaces: ' || string_agg(name, ', ') from workspaces;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'user B sees: ' || string_agg(name, ', ') from contacts;
\set ON_ERROR_STOP 0
insert into contacts(workspace_id,name) values ('10000000-0000-0000-0000-00000000000a','sneaky write into A');
