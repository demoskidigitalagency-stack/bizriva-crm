-- Live-database test for the follow-up engine (private.followups_tick). Everything rolls back (final raise).
create temp table r(n serial, name text, ok boolean, info text);
create temp table v(k text primary key, val text);
create function pg_temp.chk(name text, cond boolean, info text default null) returns void language sql as $$ insert into r(name, ok, info) values (name, coalesce(cond, false), info); $$;
create function pg_temp.g(key text) returns uuid language sql as $$ select val::uuid from v where k = key $$;
do $$
declare w1 uuid; w2 uuid; w3 uuid; ca uuid; ce uuid; cb uuid; cc uuid; cg uuid; cq uuid; va uuid; ve uuid; vb uuid; vc uuid; vq uuid; og uuid; p uuid;
begin
  perform set_config('bizriva.system', 'on', true);
  insert into workspaces(name) values ('FU1') returning id into w1;
  insert into workspaces(name) values ('FU2') returning id into w2;
  insert into workspaces(name) values ('FU3') returning id into w3;
  insert into followup_rules(workspace_id, name, trigger, delay_hours, max_attempts, template_name, message) values (w1, 'Price reminder', 'no_reply_after_price', 2, 2, 'price_reminder:en', 'Hi {{name}}, still interested?');
  insert into followup_rules(workspace_id, name, trigger, delay_hours, max_attempts, message) values (w2, 'Details reminder', 'no_reply_after_details', 1, 2, 'Hi {{name}}, any questions?'),
    (w2, 'Unreachable', 'unreachable', 0, 1, 'Hi {{name}}, we tried to call about {{order}}');
  insert into followup_rules(workspace_id, name, trigger, delay_hours, max_attempts, message, quiet_start, quiet_end) values (w3, 'Quiet', 'no_reply_after_details', 1, 1, 'Hi', (now() at time zone 'Africa/Lagos')::time - interval '1 hour', (now() at time zone 'Africa/Lagos')::time + interval '1 hour');
  insert into contacts(workspace_id, name, phone) values (w1, 'Ada Obi', '+2348000000001') returning id into ca;
  insert into conversations(workspace_id, contact_id, channel, last_inbound_at) values (w1, ca, 'whatsapp', now() - interval '30 hours') returning id into va;
  insert into messages(workspace_id, conversation_id, direction, body, status, created_at) values (w1, va, 'in', 'How much?', 'received', now() - interval '30 hours'), (w1, va, 'out', 'It is ₦12,000', 'sent', now() - interval '29 hours');
  insert into contacts(workspace_id, name, phone) values (w1, 'Eze Out', '+2348000000002') returning id into ce;
  insert into conversations(workspace_id, contact_id, channel, last_inbound_at) values (w1, ce, 'whatsapp', now() - interval '30 hours') returning id into ve;
  insert into messages(workspace_id, conversation_id, direction, body, status, created_at) values (w1, ve, 'in', 'How much?', 'received', now() - interval '30 hours'), (w1, ve, 'out', 'It is ₦12,000', 'sent', now() - interval '29 hours');
  insert into consents(workspace_id, contact_id, channel, category, granted, source) values (w1, ce, 'whatsapp', 'marketing', false, 'customer replied STOP');
  insert into contacts(workspace_id, name, phone) values (w2, 'Bola Ade', '+2348000000003') returning id into cb;
  insert into conversations(workspace_id, contact_id, channel, last_inbound_at) values (w2, cb, 'whatsapp', now() - interval '3 hours') returning id into vb;
  insert into messages(workspace_id, conversation_id, direction, body, status, created_at) values (w2, vb, 'in', 'Tell me more', 'received', now() - interval '3 hours'), (w2, vb, 'out', 'It is shea butter', 'sent', now() - interval '150 minutes');
  insert into contacts(workspace_id, name, phone) values (w2, 'Chi Replied', '+2348000000004') returning id into cc;
  insert into conversations(workspace_id, contact_id, channel, last_inbound_at) values (w2, cc, 'whatsapp', now() - interval '1 hour') returning id into vc;
  insert into messages(workspace_id, conversation_id, direction, body, status, created_at) values (w2, vc, 'in', 'Hi', 'received', now() - interval '3 hours'), (w2, vc, 'out', 'Hello', 'sent', now() - interval '2 hours'), (w2, vc, 'in', 'Thanks', 'received', now() - interval '1 hour');
  insert into contacts(workspace_id, name, phone) values (w2, 'Gbenga Form', '+2348000000005') returning id into cg;
  insert into products(workspace_id, name, price) values (w2, 'Cream', 5000) returning id into p;
  insert into orders(workspace_id, contact_id, subtotal, total) values (w2, cg, 5000, 5000) returning id into og;
  insert into order_contact_attempts(workspace_id, order_id, via, outcome, at) values (w2, og, 'call', 'no_answer', now() - interval '2 hours'), (w2, og, 'call', 'busy', now() - interval '1 hour');
  insert into contacts(workspace_id, name, phone) values (w3, 'Quiet Q', '+2348000000006') returning id into cq;
  insert into conversations(workspace_id, contact_id, channel, last_inbound_at) values (w3, cq, 'whatsapp', now() - interval '3 hours') returning id into vq;
  insert into messages(workspace_id, conversation_id, direction, body, status, created_at) values (w3, vq, 'in', 'Hi', 'received', now() - interval '3 hours'), (w3, vq, 'out', 'Hello', 'sent', now() - interval '2 hours');
  insert into v values ('va', va), ('ve', ve), ('vb', vb), ('vc', vc), ('cg', cg), ('vq', vq), ('w1', w1);
end $$;
insert into v select 't1', private.followups_tick()::text;
select pg_temp.chk('A: reminder sent with the template (window closed)', exists (select 1 from messages where conversation_id = pg_temp.g('va') and direction = 'out' and status = 'queued' and template_name = 'price_reminder:en'));
select pg_temp.chk('E: opted-out customer gets nothing', not exists (select 1 from followup_jobs where conversation_id = pg_temp.g('ve')));
select pg_temp.chk('B: in-window reminder is the rule''s message with the name', exists (select 1 from messages where conversation_id = pg_temp.g('vb') and status = 'queued' and body = 'Hi Bola, any questions?' and template_name is null));
select pg_temp.chk('C: customer who replied gets nothing', not exists (select 1 from followup_jobs where conversation_id = pg_temp.g('vc')));
select pg_temp.chk('G: unreachable order opens a WhatsApp chat for the customer', exists (select 1 from conversations where contact_id = pg_temp.g('cg') and channel = 'whatsapp'));
select pg_temp.chk('G: outside the window with no template → not sent, reason kept', (select state = 'failed' and cancel_reason = 'needs_template' from followup_jobs j join conversations c on c.id = j.conversation_id where c.contact_id = pg_temp.g('cg')));
select pg_temp.chk('Q: quiet hours hold the reminder', (select state from followup_jobs where conversation_id = pg_temp.g('vq')) = 'scheduled' and not exists (select 1 from messages where conversation_id = pg_temp.g('vq') and status = 'queued'));
insert into v select 't2', private.followups_tick()::text;
select pg_temp.chk('A: second attempt waits for the daily cap', (select count(*) from followup_jobs where conversation_id = pg_temp.g('va') and state = 'sent') = 1 and exists (select 1 from followup_jobs where conversation_id = pg_temp.g('va') and attempt = 2 and state = 'scheduled'));
select pg_temp.chk('running twice never sends twice', (select count(*) from messages where conversation_id = pg_temp.g('vb') and status = 'queued') = 1);
insert into messages(workspace_id, conversation_id, direction, body, status) values (pg_temp.g('w1'), pg_temp.g('va'), 'in', 'Yes I still want it', 'received');
insert into v select 't3', private.followups_tick()::text;
select pg_temp.chk('A: customer replied → scheduled reminder cancelled', (select cancel_reason from followup_jobs where conversation_id = pg_temp.g('va') and attempt = 2) = 'replied');
select pg_temp.chk('A: and no new reminder while they are talking', not exists (select 1 from followup_jobs where conversation_id = pg_temp.g('va') and state = 'scheduled'));
do $$ begin raise exception E'RESULTS %/% passed\n%', (select count(*) filter (where ok) from r), (select count(*) from r),
  (select string_agg(n || ' ' || case when ok then 'PASS' else 'FAIL' end || ' ' || name || coalesce(' — ' || info, ''), E'\n' order by n) from r); end $$;
