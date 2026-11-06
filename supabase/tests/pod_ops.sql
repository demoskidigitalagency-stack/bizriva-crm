-- Live-database test for agents, call list, partners, commission and campaigns.
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
insert into v values ('ws', public.create_workspace('POD Shop'));
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
insert into v select 'ca', id from contacts where name = 'Abuja Man';
insert into conversations(workspace_id, contact_id, channel) select pg_temp.g('ws'), id, 'whatsapp' from contacts where workspace_id = pg_temp.g('ws');

-- Least busy: both free, so alphabetical (Amaka); then the other one.
insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('ws'), pg_temp.g('cl'), 10000, 10000);
insert into v select 'o1', id from orders where workspace_id = pg_temp.g('ws') order by created_at, ref limit 1;
select pg_temp.chk('new order goes to an agent on duty straight away', (select assigned_to from orders where id = pg_temp.g('o1')) is not null, (select assigned_to::text from orders where id = pg_temp.g('o1')));
select pg_temp.chk('off-duty manager gets nothing', (select assigned_to from orders where id = pg_temp.g('o1')) <> '00000000-0000-0000-0000-0000000000a2');
insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('ws'), pg_temp.g('cl'), 10000, 10000);
select pg_temp.chk('least busy spreads orders', (select count(distinct assigned_to) from orders where workspace_id = pg_temp.g('ws')) = 2);
select pg_temp.t('staff cannot pre-assign an order to an outsider', $q$ do $d$ declare a uuid; begin insert into orders(workspace_id, contact_id, subtotal, total, assigned_to) values (pg_temp.g('ws'), pg_temp.g('cl'), 1, 1, '00000000-0000-0000-0000-0000000000b9') returning assigned_to into a; if a = '00000000-0000-0000-0000-0000000000b9' then raise exception 'kept outsider'; end if; raise exception 'rollback'; end $d$ $q$, false);

-- By state
update workspaces set assignment = assignment || '{"mode":"by_state"}' where id = pg_temp.g('ws');
insert into orders(workspace_id, contact_id, subtotal, total, payment_method) values (pg_temp.g('ws'), pg_temp.g('ca'), 10000, 10000, 'cod');
insert into v select 'oa', id from orders where contact_id = pg_temp.g('ca');
select pg_temp.chk('by state: Abuja order goes to the FCT agent', (select assigned_to from orders where id = pg_temp.g('oa')) = '00000000-0000-0000-0000-0000000000a4');
insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('ws'), pg_temp.g('cl'), 10000, 10000);
select pg_temp.chk('by state: Ikeja (Lagos) order goes to the Lagos agent', (select assigned_to from orders where workspace_id = pg_temp.g('ws') and contact_id = pg_temp.g('cl') order by ref desc limit 1) = '00000000-0000-0000-0000-0000000000a3');
-- Round robin
update workspaces set assignment = assignment || '{"mode":"round_robin"}' where id = pg_temp.g('ws');
insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('ws'), pg_temp.g('cl'), 1, 1);
insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('ws'), pg_temp.g('cl'), 1, 1);
select pg_temp.chk('round robin takes turns', (select count(distinct assigned_to) from (select assigned_to from orders where workspace_id = pg_temp.g('ws') and total = 1 order by ref desc limit 2) x) = 2);
select pg_temp.t('invalid sharing mode is refused', $q$ update workspaces set assignment = '{"mode":"random","call_within_minutes":60}' where id = pg_temp.g('ws') $q$, false);

-- Sales agent
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('sales cannot reassign orders', $q$ update orders set assigned_to = case when assigned_to = '00000000-0000-0000-0000-0000000000a3' then '00000000-0000-0000-0000-0000000000a4'::uuid else '00000000-0000-0000-0000-0000000000a3'::uuid end where id = pg_temp.g('o1') $q$, false);
insert into order_contact_attempts(workspace_id, order_id, by_user, via, outcome) values (pg_temp.g('ws'), pg_temp.g('oa'), '00000000-0000-0000-0000-0000000000a3', 'call', 'no_answer');
select pg_temp.chk('call attempt is stamped with the real caller', (select by_user from order_contact_attempts where order_id = pg_temp.g('oa')) = '00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('call records cannot be deleted', $q$ with d as (delete from order_contact_attempts where order_id = pg_temp.g('oa') returning 1) select 1 / (select count(*) from d) $q$, false);
select pg_temp.t('call records cannot be edited', $q$ with u as (update order_contact_attempts set outcome = 'reached' where order_id = pg_temp.g('oa') returning 1) select 1 / (select count(*) from u) $q$, false);
select pg_temp.t('sales cannot mark commission paid', $q$ select public.pay_commission(pg_temp.g('ws'), '00000000-0000-0000-0000-0000000000a4') $q$, false);
select pg_temp.t('sales cannot add a logistics partner', $q$ insert into logistics_partners(workspace_id, name, phone) values (pg_temp.g('ws'), 'X', '08030000000') $q$, false);
select pg_temp.t('sales cannot create a campaign', $q$ insert into campaigns(workspace_id, name, channel, template_name) values (pg_temp.g('ws'), 'X', 'whatsapp', 't') $q$, false);

-- Manager
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('manager reassigns an order', $q$ with u as (update orders set assigned_to = '00000000-0000-0000-0000-0000000000a3' where id = pg_temp.g('o1') returning 1) select 1 / (select count(*) from u) $q$, true);
select pg_temp.t('cannot assign to someone outside the team', $q$ update orders set assigned_to = '00000000-0000-0000-0000-0000000000b9' where id = pg_temp.g('o1') $q$, false);
select pg_temp.t('order move history cannot be edited', $q$ update orders set moved_from = array['00000000-0000-0000-0000-0000000000a2'::uuid] where id = pg_temp.g('o1') $q$, false);
select pg_temp.t('commission cannot be marked paid on an undelivered order (even by an owner path)', $q$ update orders set commission_paid_at = now() where id = pg_temp.g('o1') $q$, false);
insert into logistics_partners(workspace_id, name, phone, kind, states, fees, failed_fee) values (pg_temp.g('ws'), 'Arewa Express', '08160000000', 'partner', '{FCT,Kano}', '{"FCT":4000,"Kano":5000}', 1500);
insert into v select 'lp', id from logistics_partners where workspace_id = pg_temp.g('ws');
select pg_temp.t('group link must be a WhatsApp group link', $q$ insert into logistics_partners(workspace_id, name, phone, whatsapp_group) values (pg_temp.g('ws'), 'Bad', '08030000009', 'https://evil.example/x') $q$, false);
select pg_temp.t('can''t send an unconfirmed order to logistics', $q$ insert into deliveries(workspace_id, order_id) values (pg_temp.g('ws'), pg_temp.g('oa')); select public.send_to_partner((select id from deliveries where order_id = pg_temp.g('oa'))) $q$, false);
select pg_temp.t('manager (a money role) records a ₦1 deposit', $q$ insert into payments(workspace_id, order_id, contact_id, kind, method, amount) values (pg_temp.g('ws'), pg_temp.g('oa'), pg_temp.g('ca'), 'full', 'cash', 1) $q$, true);

-- Confirm the Abuja COD order and send it to the partner.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
update orders set status = 'confirmed' where id = pg_temp.g('oa');
insert into deliveries(workspace_id, order_id) select pg_temp.g('ws'), pg_temp.g('oa') where not exists (select 1 from deliveries where order_id = pg_temp.g('oa'));
select pg_temp.t('sales cannot send to logistics', $q$ select public.send_to_partner((select id from deliveries where order_id = pg_temp.g('oa'))) $q$, false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into v select 'tok', public.send_to_partner((select id from deliveries where order_id = pg_temp.g('oa'))) ->> 'token';
select pg_temp.chk('routes to the partner covering FCT with its fee', (select partner_id = pg_temp.g('lp') and fee = 4000 and sent_at is not null from deliveries where order_id = pg_temp.g('oa')));
select pg_temp.chk('only a hash of the link token is kept', (select link_token_hash <> (select val from v where k = 'tok') and length(link_token_hash) = 64 from deliveries where order_id = pg_temp.g('oa')));
select pg_temp.t('signed-in users cannot open delivery links directly', $q$ select public.svc_delivery_view('x') $q$, false);
reset role;

select pg_temp.chk('moving uncalled orders runs on a schedule', exists (select 1 from cron.job where jobname = 'bizriva-move-uncalled'));
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('a wrong link shows nothing', public.svc_delivery_view('not-the-token') is null);
select pg_temp.chk('the partner''s link shows the job and amount to collect', (public.svc_delivery_view((select val from v where k = 'tok')) ->> 'collect')::numeric = 9999,
  public.svc_delivery_view((select val from v where k = 'tok'))::text);
select pg_temp.chk('partner accepts', (public.svc_delivery_action((select val from v where k = 'tok'), 'accept') ->> 'status') = 'ok');
select pg_temp.chk('…order is now dispatched', (select status::text from orders where id = pg_temp.g('oa')) = 'dispatched');
select pg_temp.chk('cash above the order total is refused', (public.svc_delivery_action((select val from v where k = 'tok'), 'delivered', 999999) ->> 'status') = 'invalid');
select pg_temp.chk('partner marks delivered with cash', (public.svc_delivery_action((select val from v where k = 'tok'), 'delivered', 9999) ->> 'status') = 'ok');
select pg_temp.chk('…order delivered and fully paid', (select status::text = 'delivered' and amount_paid = total from orders where id = pg_temp.g('oa')));
select pg_temp.chk('…link closes after delivery', (public.svc_delivery_action((select val from v where k = 'tok'), 'failed') ->> 'status') = 'closed');
select pg_temp.chk('partner statement: cash, fee', (select cash_collected = 9999 and fees = 4000 and delivered = 1 from partner_statements where partner_id = pg_temp.g('lp')));
-- Make one order look 5 hours uncalled, then move it.
insert into v select 'mv', id from orders where workspace_id = pg_temp.g('ws') and status = 'pending_verification' and assigned_to = '00000000-0000-0000-0000-0000000000a3' order by ref limit 1;
update orders set assigned_at = now() - interval '5 hours' where id = pg_temp.g('mv');
select pg_temp.chk('uncalled orders move to another agent', private.move_uncalled() >= 1);
select pg_temp.chk('…to the other agent, with the history kept', (select assigned_to = '00000000-0000-0000-0000-0000000000a4' and '00000000-0000-0000-0000-0000000000a3' = any(moved_from) from orders where id = pg_temp.g('mv')));
reset role;

-- Finance pays commission
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select pg_temp.chk('commission earned once delivered and paid', (select earned = 500 and unpaid = 500 from agent_commission where user_id = '00000000-0000-0000-0000-0000000000a4'));
select pg_temp.chk('finance marks it paid', public.pay_commission(pg_temp.g('ws'), '00000000-0000-0000-0000-0000000000a4') = 1);
select pg_temp.chk('…nothing left to pay', (select unpaid = 0 from agent_commission where user_id = '00000000-0000-0000-0000-0000000000a4'));
select pg_temp.t('finance cannot connect the email service', $q$ select public.save_email_key(pg_temp.g('ws'), 'brevo', 'a@b.ng', 'xkeysib-1234567890abcdef') $q$, false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('manager creates an email campaign', $q$ insert into campaigns(workspace_id, name, channel, subject, body) values (pg_temp.g('ws'), 'VIP', 'email', 'Hi', 'Hello {{name}}') $q$, true);
select pg_temp.t('email campaign needs a subject and message', $q$ insert into campaigns(workspace_id, name, channel) values (pg_temp.g('ws'), 'Empty', 'email') $q$, false);
select pg_temp.t('staff cannot fake campaign opens', $q$ insert into campaign_recipients(campaign_id, workspace_id, contact_id, opened_at) select id, workspace_id, pg_temp.g('cl'), now() from campaigns where name = 'VIP' $q$, false);
reset role;

do $$ begin raise exception E'RESULTS %/% passed\n%', (select count(*) filter (where ok) from r), (select count(*) from r),
  (select string_agg(n || ' ' || case when ok then 'PASS' else 'FAIL' end || ' ' || name || coalesce(' — ' || info, ''), E'\n' order by n) from r); end $$;
