-- Live-database test for tasks, notes, lead outcomes and merging customers.
-- Reports through an error at the end, so everything is rolled back.
create temp table r(n serial, name text, ok boolean, info text);
grant all on r to authenticated, service_role; grant all on sequence r_n_seq to authenticated, service_role;
create temp table v(k text primary key, val text);
grant all on v to authenticated, service_role;
create function pg_temp.t(name text, q text, should_work boolean) returns void language plpgsql as $$
begin
  begin execute q; insert into r(name, ok, info) values (name, should_work, case when should_work then 'ok' else 'NOT BLOCKED' end);
  exception when others then insert into r(name, ok, info) values (name, not should_work, sqlerrm); end;
end $$;
create function pg_temp.chk(name text, cond boolean, info text default null) returns void language sql as $$ insert into r(name, ok, info) values (name, coalesce(cond, false), info); $$;
create function pg_temp.g(key text) returns uuid language sql as $$ select val::uuid from v where k = key $$;
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@t.ng', now(), 'authenticated', 'authenticated', '{"full_name":"Ola Owner"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'manager@t.ng', now(), 'authenticated', 'authenticated', '{"full_name":"Mina Manager"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'chidi@t.ng', now(), 'authenticated', 'authenticated', '{"full_name":"Chidi Lagos"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'amaka@t.ng', now(), 'authenticated', 'authenticated', '{"full_name":"Amaka Abuja"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'fin@t.ng', now(), 'authenticated', 'authenticated', '{"full_name":"Femi Finance"}');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into v values ('ws', public.create_workspace('Merge Shop'));
-- Five people need a plan with more than the Trial's 3 seats (plans and limits, 2026-11-06).
reset role;
select set_config('bizriva.system', 'on', true);
update workspaces set plan = 'growth', plan_renews_at = now() + interval '30 days' where id = pg_temp.g('ws');
select set_config('bizriva.system', '', true);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into workspace_members(workspace_id, user_id, role, on_duty, states) values
  (pg_temp.g('ws'), '00000000-0000-0000-0000-0000000000a2', 'manager', false, '{}'),
  (pg_temp.g('ws'), '00000000-0000-0000-0000-0000000000a3', 'sales', true, '{Lagos}'),
  (pg_temp.g('ws'), '00000000-0000-0000-0000-0000000000a4', 'sales', true, '{FCT}'),
  (pg_temp.g('ws'), '00000000-0000-0000-0000-0000000000a5', 'finance', true, '{}');
update workspaces set commission_per_order = 500 where id = pg_temp.g('ws');
insert into products(workspace_id, name, price) values (pg_temp.g('ws'), 'Edge Gel', 10000);
insert into v select 'p', id from products where workspace_id = pg_temp.g('ws');
insert into contacts(workspace_id, name, phone, location) values (pg_temp.g('ws'), 'Lagos Lady', '08030000001', 'Ikeja'), (pg_temp.g('ws'), 'Abuja Man', '08030000002', 'Abuja');
insert into v select 'cl', id from contacts where name = 'Lagos Lady';
insert into conversations(workspace_id, contact_id, channel) values (pg_temp.g('ws'), pg_temp.g('cl'), 'whatsapp');
insert into contacts(workspace_id, name, phone, tags) values (pg_temp.g('ws'), 'Ada Dup', null, '{vip}');
insert into v select 'cd', id from contacts where name = 'Ada Dup';
insert into conversations(workspace_id, contact_id, channel) values (pg_temp.g('ws'), pg_temp.g('cd'), 'whatsapp');
insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('ws'), pg_temp.g('cd'), 10000, 10000);

-- Tasks
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('agent adds a task for a customer', $q$ insert into tasks(workspace_id, contact_id, title, due_at, assigned_to, created_by) values (pg_temp.g('ws'), pg_temp.g('cl'), 'Call back', now(), '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1') $q$, true);
select pg_temp.chk('the server records who made it', (select created_by from tasks where title = 'Call back') = '00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('task cannot go to an outsider', $q$ insert into tasks(workspace_id, title, assigned_to) values (pg_temp.g('ws'), 'X', '00000000-0000-0000-0000-0000000000b9') $q$, false);
select pg_temp.t('task title cannot be empty', $q$ insert into tasks(workspace_id, title) values (pg_temp.g('ws'), '  ') $q$, false);
update tasks set status = 'done' where title = 'Call back';
select pg_temp.chk('completing stamps the time', (select done_at from tasks where title = 'Call back') is not null);
select pg_temp.t('agent cannot delete tasks', $q$ do $d$ begin delete from tasks where title = 'Call back'; if not found then raise exception 'blocked'; end if; end $d$ $q$, false);
-- Notes go to the append-only log
select pg_temp.t('agent adds a note', $q$ insert into activity_log(workspace_id, entity, entity_id, action, detail) values (pg_temp.g('ws'), 'contact', pg_temp.g('cl'), 'note', '{"text":"Prefers evening calls"}') $q$, true);
select pg_temp.chk('note carries the author', (select actor from activity_log where action = 'note') = '00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('notes cannot be edited', $q$ do $d$ begin update activity_log set detail = '{}' where action = 'note'; if not found then raise exception 'blocked'; end if; end $d$ $q$, false);
-- Lead outcome
insert into leads(workspace_id, contact_id) values (pg_temp.g('ws'), pg_temp.g('cl'));
select pg_temp.t('agent sets a lead outcome', $q$ update leads set outcome = 'nurture' where contact_id = pg_temp.g('cl') $q$, true);
select pg_temp.t('outcome must be a known one', $q$ update leads set outcome = 'banana' where contact_id = pg_temp.g('cl') $q$, false);
-- Merge
select pg_temp.t('agent cannot merge customers', $q$ select public.merge_contacts(pg_temp.g('ws'), pg_temp.g('cl'), array[pg_temp.g('cd')]) $q$, false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.chk('manager merges the duplicate', public.merge_contacts(pg_temp.g('ws'), pg_temp.g('cl'), array[pg_temp.g('cd'), pg_temp.g('cl')]) = 1);
select pg_temp.chk('the duplicate is gone', not exists (select 1 from contacts where id = pg_temp.g('cd')));
select pg_temp.chk('its order moved to the kept customer', (select count(*) from orders where contact_id = pg_temp.g('cl')) = 1);
select pg_temp.chk('its chat moved too', (select count(*) from conversations where contact_id = pg_temp.g('cl')) = 2);
select pg_temp.chk('tags combined', (select 'vip' = any(tags) from contacts where id = pg_temp.g('cl')));
select pg_temp.chk('merge is logged', exists (select 1 from activity_log where action = 'merged' and entity_id = pg_temp.g('cl')));
select pg_temp.chk('merging nothing does nothing', public.merge_contacts(pg_temp.g('ws'), pg_temp.g('cl'), array[]::uuid[]) = 0);
reset role;

do $$ begin raise exception E'RESULTS %/% passed\n%', (select count(*) filter (where ok) from r), (select count(*) from r),
  (select string_agg(n || ' ' || case when ok then 'PASS' else 'FAIL' end || ' ' || name || coalesce(' — ' || info, ''), E'\n' order by n) from r); end $$;
