-- Live-database test for the loophole fixes and server rules.
-- Runs inside a transaction that is rolled back: nothing is kept.
-- Run with the Supabase SQL editor (or MCP execute_sql). The last statement
-- reports the results as an error on purpose, which rolls everything back.
begin;
create temp table r(n serial, name text, ok boolean, info text);
grant all on r to authenticated, service_role; grant all on sequence r_n_seq to authenticated, service_role;
create temp table v(k text primary key, val text);
grant all on v to authenticated, service_role;

-- t(name, sql, should_work): runs sql, records pass/fail.
create function pg_temp.t(name text, q text, should_work boolean) returns void language plpgsql as $$
begin
  begin
    execute q;
    insert into r(name, ok, info) values (name, should_work, case when should_work then 'ok' else 'NOT BLOCKED' end);
  exception when others then
    insert into r(name, ok, info) values (name, not should_work, sqlerrm);
  end;
end $$;
create function pg_temp.chk(name text, cond boolean, info text default null) returns void language sql as $$
  insert into r(name, ok, info) values (name, coalesce(cond, false), info);
$$;
create function pg_temp.g(key text) returns uuid language sql as $$ select val::uuid from v where k = key $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@test.ng', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'manager.a@test.ng', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'sales.a@test.ng', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@test.ng', now(), 'authenticated', 'authenticated');

-- ── Owner A sets up the business ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into v values ('wsa', public.create_workspace('Shop A'));
insert into workspace_members(workspace_id, user_id, role) values
  (pg_temp.g('wsa'), '00000000-0000-0000-0000-0000000000a2', 'manager'),
  (pg_temp.g('wsa'), '00000000-0000-0000-0000-0000000000a3', 'sales');
select pg_temp.t('owner cannot remove the last owner (themselves)', $q$ delete from workspace_members where user_id = '00000000-0000-0000-0000-0000000000a1' $q$, false);
select pg_temp.t('owner cannot change the plan', $q$ update workspaces set plan = 'pro' where id = pg_temp.g('wsa') $q$, false);
select pg_temp.t('owner can rename the business', $q$ with u as (update workspaces set name = 'Shop A Ltd' where id = pg_temp.g('wsa') returning 1) select 1 / (select count(*) from u) $q$, true);
insert into products(workspace_id, name, price, category, care_guide) values (pg_temp.g('wsa'), 'Bone Straight 20"', 10000, 'Hair Bundles', 'Wash gently.');
reset role;
insert into v select 'p1', id from products where workspace_id = pg_temp.g('wsa');

-- ── Manager tries to take over ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select pg_temp.t('manager cannot promote themselves to owner', $q$ update workspace_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a2' $q$, false);
select pg_temp.t('manager cannot make sales an owner', $q$ update workspace_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a3' $q$, false);
select pg_temp.t('manager cannot demote the owner', $q$ update workspace_members set role = 'sales' where user_id = '00000000-0000-0000-0000-0000000000a1' $q$, false);
select pg_temp.t('manager cannot remove the owner', $q$ delete from workspace_members where user_id = '00000000-0000-0000-0000-0000000000a1' $q$, false);
select pg_temp.t('manager cannot invite an owner', $q$ insert into workspace_invites(workspace_id, email, role) values (pg_temp.g('wsa'), 'x@test.ng', 'owner') $q$, false);
select pg_temp.t('manager can invite sales', $q$ insert into workspace_invites(workspace_id, email, role) values (pg_temp.g('wsa'), 'y@test.ng', 'sales') $q$, true);
select pg_temp.chk('invite records who sent it', (select invited_by from workspace_invites where email = 'y@test.ng') = '00000000-0000-0000-0000-0000000000a2');

-- ── Sales works an order ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
insert into contacts(workspace_id, name, phone) values (pg_temp.g('wsa'), 'Ada Obi', '08031234567');
insert into v select 'c1', id from contacts where name = 'Ada Obi';
insert into leads(workspace_id, contact_id) values (pg_temp.g('wsa'), pg_temp.g('c1'));
insert into conversations(workspace_id, contact_id, channel) values (pg_temp.g('wsa'), pg_temp.g('c1'), 'whatsapp');
insert into orders(workspace_id, contact_id, subtotal, total, payment_method) values (pg_temp.g('wsa'), pg_temp.g('c1'), 10000, 10000, 'cod');
insert into v select 'o1', id from orders where contact_id = pg_temp.g('c1');
insert into order_items(workspace_id, order_id, product_id, quantity, unit_price) values (pg_temp.g('wsa'), pg_temp.g('o1'), pg_temp.g('p1'), 1, 10000);
select pg_temp.chk('server numbers the order', (select ref from orders where id = pg_temp.g('o1')) = 'BZ-1001', (select ref from orders where id = pg_temp.g('o1')));
select pg_temp.chk('lead moved to order_created', (select stage::text from leads where contact_id = pg_temp.g('c1')) = 'order_created');
select pg_temp.t('new order cannot start as delivered', $q$ insert into orders(workspace_id, contact_id, status, subtotal, total) values (pg_temp.g('wsa'), pg_temp.g('c1'), 'delivered', 1, 1) $q$, false);
select pg_temp.t('new order cannot claim money already paid', $q$ do $d$ declare x numeric; begin insert into orders(workspace_id, contact_id, subtotal, total, amount_paid) values (pg_temp.g('wsa'), pg_temp.g('c1'), 5, 5, 5) returning amount_paid into x; if x <> 0 then raise exception 'kept'; end if; raise exception 'rollback'; end $d$ $q$, false);
select pg_temp.t('discount cannot exceed subtotal', $q$ insert into orders(workspace_id, contact_id, subtotal, discount, total) values (pg_temp.g('wsa'), pg_temp.g('c1'), 100, 500, 0) $q$, false);
select pg_temp.t('sales cannot type an amount paid', $q$ update orders set amount_paid = 10000 where id = pg_temp.g('o1') $q$, false);
select pg_temp.t('unverified order cannot go to dispatch', $q$ update orders set status = 'ready_for_dispatch' where id = pg_temp.g('o1') $q$, false);
select pg_temp.t('unverified order cannot jump to delivered', $q$ update orders set status = 'delivered' where id = pg_temp.g('o1') $q$, false);
select pg_temp.t('sales cannot record a payment', $q$ insert into payments(workspace_id, order_id, contact_id, kind, method, amount) values (pg_temp.g('wsa'), pg_temp.g('o1'), pg_temp.g('c1'), 'full', 'cash', 10000) $q$, false);
select pg_temp.t('sales cannot delete an order', $q$ with d as (delete from orders where id = pg_temp.g('o1') returning 1) select 1 / (select count(*) from d) $q$, false);
select pg_temp.t('sales cannot fake a customer message', $q$ insert into messages(workspace_id, conversation_id, direction, body, status) select pg_temp.g('wsa'), id, 'in', 'I paid already', 'received' from conversations where contact_id = pg_temp.g('c1') $q$, false);
select pg_temp.t('sales cannot fake a webhook', $q$ insert into webhook_events(workspace_id, provider, event_id, payload) values (pg_temp.g('wsa'), 'paystack', 'x', '{}') $q$, false);
insert into activity_log(workspace_id, actor, entity, action) values (pg_temp.g('wsa'), '00000000-0000-0000-0000-0000000000a1', 'test', 'spoof');
select pg_temp.chk('activity actor is the real person', (select actor from activity_log where action = 'spoof') = '00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('activity log cannot be deleted', $q$ with d as (delete from activity_log where action = 'spoof' returning 1) select 1 / (select count(*) from d) $q$, false);
select pg_temp.t('sales confirms the order', $q$ update orders set status = 'confirmed' where id = pg_temp.g('o1') $q$, true);
select pg_temp.chk('confirmation time stamped', (select customer_confirmed_at is not null from orders where id = pg_temp.g('o1')));
select pg_temp.chk('lead moved to order_confirmed', (select stage::text from leads where contact_id = pg_temp.g('c1')) = 'order_confirmed');

-- ── Owner records a deposit ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select pg_temp.t('payment above balance is refused', $q$ insert into payments(workspace_id, order_id, contact_id, kind, method, amount) values (pg_temp.g('wsa'), pg_temp.g('o1'), pg_temp.g('c1'), 'full', 'bank_transfer', 20000) $q$, false);
select pg_temp.t('owner records a ₦4,000 deposit', $q$ insert into payments(workspace_id, order_id, contact_id, kind, method, amount) values (pg_temp.g('wsa'), pg_temp.g('o1'), pg_temp.g('c1'), 'deposit', 'bank_transfer', 4000) $q$, true);
select pg_temp.chk('amount paid follows the payments', (select amount_paid from orders where id = pg_temp.g('o1')) = 4000);
select pg_temp.t('a recorded payment cannot be edited', $q$ update payments set amount = 9000 where order_id = pg_temp.g('o1') $q$, false);
select pg_temp.t('total cannot drop below what was paid', $q$ update orders set total = 3000, subtotal = 3000 where id = pg_temp.g('o1') $q$, false);

-- ── Dispatch and delivery ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
select pg_temp.t('confirmed COD goes to dispatch', $q$ update orders set status = 'ready_for_dispatch' where id = pg_temp.g('o1') $q$, true);
select pg_temp.chk('delivery opened', exists (select 1 from deliveries where order_id = pg_temp.g('o1')));
select pg_temp.t('dispatched', $q$ update orders set status = 'dispatched' where id = pg_temp.g('o1') $q$, true);
select pg_temp.t('price locked after dispatch', $q$ update orders set total = 12000, subtotal = 12000 where id = pg_temp.g('o1') $q$, false);
select pg_temp.t('delivered', $q$ update orders set status = 'delivered' where id = pg_temp.g('o1') $q$, true);
select pg_temp.chk('COD cash recorded for the balance', (select amount from payments where order_id = pg_temp.g('o1') and kind = 'cod_cash') = 6000);
select pg_temp.chk('order fully paid', (select amount_paid from orders where id = pg_temp.g('o1')) = 10000);
select pg_temp.chk('receipt number set', (select receipt_no from orders where id = pg_temp.g('o1')) = 'RCPT-BZ-1001');
select pg_temp.chk('lead converted', (select stage::text from leads where contact_id = pg_temp.g('c1')) = 'converted');
select pg_temp.chk('lifetime value counted on delivery', (select lifetime_value from customers where contact_id = pg_temp.g('c1')) = 10000);
select pg_temp.chk('confirmation, dispatch, receipt and care guide queued', (select count(*) from messages m join conversations c on c.id = m.conversation_id where c.contact_id = pg_temp.g('c1') and m.status = 'queued') = 4,
  (select string_agg(left(body, 25), ' | ') from messages));
select pg_temp.chk('care guide included', exists (select 1 from messages where body like '%How to use and care%Wash gently.%'));
select pg_temp.t('delivered cannot be cancelled', $q$ update orders set status = 'cancelled' where id = pg_temp.g('o1') $q$, false);
select pg_temp.chk('every change logged', (select count(*) from activity_log where entity = 'order' and entity_id = pg_temp.g('o1')) = 5);
select pg_temp.t('sales cannot match provider payments', $q$ select public.match_payment(gen_random_uuid(), pg_temp.g('o1')) $q$, false);
select pg_temp.t('signed-in users cannot call server functions', $q$ select public.svc_ingest(gen_random_uuid(), 'x', '{}', '{}') $q$, false);

-- ── Shop B tries to reach Shop A ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into v values ('wsb', public.create_workspace('Shop B'));
select pg_temp.chk('Shop B sees none of Shop A''s customers', (select count(*) from contacts) = 0);
select pg_temp.t('Shop B cannot attach an order to Shop A''s customer', $q$ insert into orders(workspace_id, contact_id, subtotal, total) values (pg_temp.g('wsb'), pg_temp.g('c1'), 1, 1) $q$, false);
select pg_temp.t('Shop B cannot invite itself into Shop A', $q$ insert into workspace_invites(workspace_id, email, role) values (pg_temp.g('wsa'), 'owner.b@test.ng', 'owner') $q$, false);
reset role;

-- ── Server: payment webhook, website intake, public order form ──
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into contacts(workspace_id, name, phone) values (pg_temp.g('wsa'), 'Bola Ade', '+2348051112222');
insert into v select 'c2', id from contacts where name = 'Bola Ade';
insert into conversations(workspace_id, contact_id, channel) values (pg_temp.g('wsa'), pg_temp.g('c2'), 'whatsapp');
insert into orders(workspace_id, contact_id, subtotal, total, payment_method) values (pg_temp.g('wsa'), pg_temp.g('c2'), 15000, 15000, 'cod');
insert into v select 'o2', id from orders where contact_id = pg_temp.g('c2');
insert into customer_accounts(workspace_id, contact_id, provider, bank_name, account_number, account_name) values (pg_temp.g('wsa'), pg_temp.g('c2'), 'paystack', 'Wema Bank', '9912345678', 'SHOP A/BOLA ADE');
select pg_temp.chk('transfer into the customer''s account matches by itself',
  (public.svc_provider_payment(pg_temp.g('wsa'), 'paystack', 'T_1', 'transfer', 15000, 'BOLA ADE', '9912345678', null, '{}') ->> 'status') = 'matched');
select pg_temp.chk('paid in full → order confirmed', (select status::text from orders where id = pg_temp.g('o2')) = 'confirmed');
select pg_temp.chk('the same notification twice is applied once',
  (public.svc_provider_payment(pg_temp.g('wsa'), 'paystack', 'T_1', 'transfer', 15000, 'BOLA ADE', '9912345678', null, '{}') ->> 'status') = 'duplicate'
  and (select amount_paid from orders where id = pg_temp.g('o2')) = 15000);
select pg_temp.chk('payment receipt queued in the chat', exists (select 1 from messages where body like '%Payment received%RCPT-BZ-1002-01%'));
select pg_temp.chk('unknown transfer stays unmatched for staff',
  (public.svc_provider_payment(pg_temp.g('wsa'), 'paystack', 'T_2', 'transfer', 7000, 'STRANGER', '0000000000', null, '{}') ->> 'status') = 'unmatched');

insert into connections(workspace_id, platform, name, secret_hash) values (pg_temp.g('wsa'), 'elementor', 'Website', encode(extensions.digest('bzk_correct_key', 'sha256'), 'hex'));
insert into v select 'cn', id from connections where workspace_id = pg_temp.g('wsa');
select pg_temp.chk('wrong secret key is refused', (public.svc_ingest(pg_temp.g('cn'), 'bzk_wrong', '{"name":"Eve","phone":"08000000000"}', '{}') ->> 'status') = 'unauthorized');
select pg_temp.chk('website order created', (public.svc_ingest(pg_temp.g('cn'), 'bzk_correct_key', '{"name":"Chi Eze","phone":"0802 555 6666","product":"Bone Straight 20\"","quantity":"2","total":1,"externalId":"E1"}', '{}') ->> 'status') = 'created_order');
select pg_temp.chk('price comes from the catalogue, not the website', (select total from orders o join contacts c on c.id = o.contact_id where c.name = 'Chi Eze') = 20000);
select pg_temp.chk('same submission twice is skipped', (public.svc_ingest(pg_temp.g('cn'), 'bzk_correct_key', '{"name":"Chi Eze","phone":"08025556666","externalId":"E1"}', '{}') ->> 'status') = 'duplicate');
select pg_temp.chk('same phone, different format → same customer', (select count(*) from contacts where workspace_id = pg_temp.g('wsa') and phone = '+2348025556666') = 1);

insert into order_forms(workspace_id, name, product_id, headline, packages) values (pg_temp.g('wsa'), 'Promo', pg_temp.g('p1'), 'Buy now', '[{"id":"one","label":"1 bundle","qty":1,"price":9500}]');
insert into v select 'f1', id from order_forms where workspace_id = pg_temp.g('wsa');
select pg_temp.chk('form refuses a bad phone', (public.svc_submit_form(pg_temp.g('f1'), 'one', 'Dayo', '123', 'Ikeja', 'Lagos', 'Lagos', null) ->> 'status') = 'invalid');
select pg_temp.chk('form refuses a made-up package', (public.svc_submit_form(pg_temp.g('f1'), 'cheap', 'Dayo', '08061234567', 'Ikeja', 'Lagos', 'Lagos', null) ->> 'status') = 'invalid');
select pg_temp.chk('form order created', (public.svc_submit_form(pg_temp.g('f1'), 'one', 'Dayo', '08061234567', '12 Allen Ave', 'Ikeja', 'Lagos', 'fb') ->> 'status') = 'created');
select pg_temp.chk('…at the form''s price', (select total from orders where form_id = pg_temp.g('f1')) = 9500);
select pg_temp.chk('double tap does not make two orders', (public.svc_submit_form(pg_temp.g('f1'), 'one', 'Dayo', '+234 806 123 4567', '12 Allen Ave', 'Ikeja', 'Lagos', 'fb') ->> 'status') = 'duplicate');
select pg_temp.chk('rate limit', (select bool_and(public.svc_rate_ok('ip:1', 3, 60)) from generate_series(1, 3)) and not public.svc_rate_ok('ip:1', 3, 60));
reset role;

-- Report by raising: the error aborts the transaction, so nothing is ever kept.
do $$ begin raise exception E'RESULTS %/% passed\n%', (select count(*) filter (where ok) from r), (select count(*) from r),
  (select string_agg(n || ' ' || case when ok then 'PASS' else 'FAIL' end || ' ' || name || coalesce(' — ' || info, ''), E'\n' order by n) from r); end $$;
