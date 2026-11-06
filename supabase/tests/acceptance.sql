-- The 15 acceptance tests, run on the live database end to end through the server's own functions
-- (the same ones the Edge Functions call). Meta and Claude are the only parts simulated: we hand the
-- server exactly what Meta's webhook / the AI would. Everything rolls back (final raise).
do $$
declare
  ws uuid; other uuid; owner uuid := gen_random_uuid(); agent uuid := gen_random_uuid(); p uuid; tok uuid;
  r jsonb; k uuid; conv uuid; mid uuid; m2 uuid; o uuid; ctx jsonb; n int; n2 int; c record; ord orders; st text; perf jsonb; k2 uuid; conv2 uuid; job_state text;
  res text[] := '{}';
  ok boolean;
begin
  insert into auth.users(id, email, aud, role) values (owner, 'acc-owner@test.invalid', 'authenticated', 'authenticated'), (agent, 'acc-agent@test.invalid', 'authenticated', 'authenticated');
  perform set_config('bizriva.system', 'on', true);
  insert into workspaces(name, settings) values ('Acceptance Shop', '{"deliveryFee": 2500, "agent": {"name": "Ada", "greeting": "Welcome to Acceptance Shop! How can I help?"}}') returning id into ws;
  insert into workspaces(name) values ('Someone Else') returning id into other;
  insert into contacts(workspace_id, name, phone) values (other, 'Private Person', '+2348099999999');
  insert into workspace_members(workspace_id, user_id, role) values (ws, owner, 'owner');
  insert into workspace_members(workspace_id, user_id, role, on_duty) values (ws, agent, 'sales', true);
  insert into products(workspace_id, name, price, stock) values (ws, 'Glow Body Cream', 12000, 40) returning id into p;
  insert into media_assets(workspace_id, product_id, kind, storage_path, bytes, name) values (ws, p, 'image', ws || '/out/media/glow.jpg', 90000, 'glow.jpg');
  insert into message_templates(workspace_id, name, category, body, status) values (ws, 'win_back', 'marketing', 'Hi {{1}}, we have new stock for you. Reply STOP to opt out.', 'approved');
  insert into followup_rules(workspace_id, name, trigger, delay_hours, max_attempts, template_name, message) values (ws, 'Price reminder', 'no_reply_after_price', 2, 2, 'win_back', 'Hi {{name}}, still interested in {{product}}?');
  tok := vault.create_secret('acceptance-token-xxxxxxxxxxxxxxxxxxxx', 'acc_' || ws);
  insert into whatsapp_numbers(workspace_id, phone_number_id, waba_id, token_secret_id, app_secret_id) values (ws, '1098765432', '2098765432', tok, tok);
  perform set_config('bizriva.system', '', true);

  -- 1. Ad click starts a WhatsApp chat; contact and ad source recorded.
  r := svc_whatsapp_inbound(ws, '2348031234567', 'Ada Obi', 'wamid.A1', 'Hi, I saw your ad', 'text', now() - interval '4 hours');
  k := (r ->> 'contact')::uuid; conv := (r ->> 'conversation')::uuid; mid := (r ->> 'message')::uuid;
  perform svc_attribute_ad(ws, k, '120200001', 'Glow cream — 20% off', 'https://fb.me/glow', 'whatsapp');
  ok := r ->> 'status' = 'saved' and (select phone from contacts where id = k) = '+2348031234567'
        and exists (select 1 from leads where contact_id = k and ad_id = '120200001' and ad_headline like 'Glow cream%');
  res := array_append(res, '1 ' || ok);

  -- 2. 'Hello' gets an immediate correct greeting: the chat is waiting for the AI and its instructions carry the business's greeting.
  ctx := svc_ai_context(conv);
  ok := exists (select 1 from private.ai_waiting where conversation_id = conv) and ctx -> 'agent' ->> 'greeting' = 'Welcome to Acceptance Shop! How can I help?';
  perform svc_ai_result(conv, mid, 'Welcome to Acceptance Shop! How can I help?', false, null, null);
  ok := ok and exists (select 1 from messages where conversation_id = conv and direction = 'out' and by_ai and body like 'Welcome to Acceptance Shop%');
  res := array_append(res, '2 ' || ok);

  -- 3. Price question answered from the catalogue (the AI sees the real price; the brain blocks any other amount — tests/ai_brain.test.ts).
  r := svc_whatsapp_inbound(ws, '2348031234567', 'Ada Obi', 'wamid.A2', 'How much is the body cream?', 'text', now() - interval '4 hours' + interval '1 minute');
  ctx := svc_ai_context(conv);
  ok := (ctx -> 'products' -> 0 ->> 'name') = 'Glow Body Cream' and (ctx -> 'products' -> 0 ->> 'price')::numeric = 12000;
  perform svc_ai_result(conv, (r ->> 'message')::uuid, 'The Glow Body Cream is ₦12,000. Delivery is ₦2,500.', false, null, null);
  perform set_config('bizriva.system', 'on', true);
  update messages set created_at = now() - interval '3 hours 50 minutes' where conversation_id = conv and direction = 'out' and body like 'The Glow Body Cream%';
  perform set_config('bizriva.system', '', true);
  res := array_append(res, '3 ' || ok);

  -- 4. Photo request sends the right media from cloud storage.
  r := svc_ai_send_photo(conv, 'glow body cream');
  ok := (r ->> 'ok')::boolean and exists (select 1 from messages where id = (r ->> 'message')::uuid and media_path = ws || '/out/media/glow.jpg' and media_kind = 'image');
  perform set_config('bizriva.system', 'on', true);
  update messages set created_at = now() - interval '3 hours 49 minutes', status = 'sent' where id = (r ->> 'message')::uuid;
  update conversations set last_inbound_at = now() - interval '4 hours' + interval '1 minute' where id = conv;
  perform set_config('bizriva.system', '', true);
  res := array_append(res, '4 ' || ok);

  -- 5. Interested-then-silent customer gets an eligible reminder scheduled.
  perform private.followups_tick();
  select state into job_state from followup_jobs where conversation_id = conv order by created_at desc limit 1;
  res := array_append(res, '5 ' || coalesce(job_state in ('scheduled', 'sent'), false));

  -- 6. A reply before the reminder cancels it.
  perform set_config('bizriva.system', 'on', true);
  update followup_jobs set state = 'scheduled', run_at = now() + interval '1 hour' where conversation_id = conv;
  update messages set status = 'sent' where conversation_id = conv and status = 'queued';
  perform set_config('bizriva.system', '', true);
  r := svc_whatsapp_inbound(ws, '2348031234567', 'Ada Obi', 'wamid.A3', 'Yes I still want it', 'text', now());
  perform private.followups_tick();
  ok := exists (select 1 from followup_jobs where conversation_id = conv and state = 'cancelled' and cancel_reason = 'replied')
        and not exists (select 1 from followup_jobs where conversation_id = conv and state = 'scheduled');
  res := array_append(res, '6 ' || ok);

  -- 7. Asking for a human pauses the AI and assigns the chat (handover rule itself: tests/ai_brain.test.ts).
  r := svc_whatsapp_inbound(ws, '2348031234567', 'Ada Obi', 'wamid.A4', 'Let me talk to a human please', 'text', now());
  perform svc_ai_result(conv, (r ->> 'message')::uuid, 'Sure — I''m passing you to a member of our team now.', true, 'Customer asked for a person', null);
  select * into c from conversations where id = conv;
  ok := c.handled_by = 'human' and c.assigned_to = agent and not exists (select 1 from private.ai_waiting where conversation_id = conv);
  res := array_append(res, '7 ' || ok);

  -- 8. Order placed in chat is created with the right details.
  perform set_config('bizriva.system', 'on', true);
  update conversations set handled_by = 'ai' where id = conv;
  perform set_config('bizriva.system', '', true);
  r := svc_ai_checkout_draft(conv, '[{"product": "Glow Body Cream", "quantity": 2}]', 'Ada Obi', '08031234567', '12 Allen Avenue, Ikeja', 'Lagos');
  ok := (r ->> 'ok')::boolean and (r ->> 'total')::numeric = 26500;
  r := svc_ai_checkout_confirm(conv);
  select * into ord from orders where ref = r ->> 'order_ref' and workspace_id = ws;
  ok := ok and ord.total = 26500 and ord.payment_method = 'cod' and ord.status = 'pending_verification' and ord.delivery_address like '12 Allen Avenue, Ikeja%'
        and exists (select 1 from order_items where order_id = ord.id and product_id = p and quantity = 2 and unit_price = 12000);
  res := array_append(res, '8 ' || ok);

  -- 9. COD order needs verification; the agent's call and confirmation are recorded.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', agent)::text, true);
  insert into order_contact_attempts(workspace_id, order_id, by_user, via, outcome) values (ws, ord.id, agent, 'call', 'reached');
  begin update orders set status = 'ready_for_dispatch' where id = ord.id; ok := false; exception when others then ok := true; end;   -- can't skip verification
  update orders set status = 'confirmed' where id = ord.id;
  select * into ord from orders where id = ord.id;
  ok := ok and ord.status = 'confirmed' and ord.customer_confirmed_at is not null and ord.risk_level = 'low'
        and exists (select 1 from activity_log where entity_id = ord.id and action = 'status:confirmed' and actor = agent);
  res := array_append(res, '9 ' || ok);

  -- 10. Dispatched order notifies the customer.
  select count(*) into n from messages m join conversations cv on cv.id = m.conversation_id where cv.contact_id = k and m.direction = 'out' and m.purpose = 'service';
  update orders set status = 'ready_for_dispatch' where id = ord.id;
  update orders set status = 'dispatched' where id = ord.id;
  select count(*) into n2 from messages m join conversations cv on cv.id = m.conversation_id where cv.contact_id = k and m.direction = 'out' and m.purpose = 'service';
  res := array_append(res, '10 ' || (n2 > n and exists (select 1 from messages m join conversations cv on cv.id = m.conversation_id where cv.contact_id = k and m.purpose = 'service' and m.body like '%' || ord.ref || '%' and m.created_at = now())));

  -- 11. Delivered order updates revenue and conversion analytics.
  update orders set status = 'delivered' where id = ord.id;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner)::text, true);
  perf := ad_performance(ws, current_date - 30, current_date);
  ok := (perf -> 'ads' -> 0 ->> 'delivered')::int = 1 and (perf -> 'ads' -> 0 ->> 'revenue')::numeric = 26500
        and exists (select 1 from payments where order_id = ord.id and kind = 'cod_cash' and amount = 26500)
        and (select stage from leads where contact_id = k order by created_at desc limit 1) = 'converted';
  perform set_config('request.jwt.claims', '', true);
  res := array_append(res, '11 ' || ok);

  -- 12. Closed 24-hour window: free text isn't sent; the approved template goes with its variables.
  insert into contacts(workspace_id, name, phone) values (ws, 'Bola Late', '+2348035550000') returning id into k2;
  perform set_config('bizriva.system', 'on', true);
  insert into conversations(workspace_id, contact_id, channel, last_inbound_at) values (ws, k2, 'whatsapp', now() - interval '30 hours') returning id into conv2;
  update messages set status = 'sent' where workspace_id = ws and status = 'queued';
  insert into messages(workspace_id, conversation_id, direction, body, status) values (ws, conv2, 'out', 'Free text after 30 hours', 'queued');
  insert into messages(workspace_id, conversation_id, direction, body, status, template_name) values (ws, conv2, 'out', null, 'queued', 'win_back');
  perform set_config('bizriva.system', '', true);
  ok := true;
  for c in select * from svc_whatsapp_claim_v2(10) x where x.workspace_id = ws loop
    if c.template_name is null then ok := ok and not c.in_window;                                   -- the sender refuses it (tests/whatsapp_payload.test.ts)
    else ok := ok and c.template_params = array['Bola']; end if;
  end loop;
  -- the sender reports the refusal back: failed with the reason, not retried
  perform svc_whatsapp_result(id, null, 'Outside the 24-hour window — needs an approved template') from messages where conversation_id = conv2 and template_name is null;
  ok := ok and exists (select 1 from messages where conversation_id = conv2 and template_name is null and status = 'failed' and error like 'Outside%');
  res := array_append(res, '12 ' || ok);

  -- 13. Integration failures retry without duplicate messages or orders.
  select count(*) into n from messages where conversation_id = conv;
  r := svc_whatsapp_inbound(ws, '2348031234567', 'Ada Obi', 'wamid.A1', 'Hi, I saw your ad', 'text', now());   -- Meta resends the same message
  ok := r ->> 'status' = 'duplicate' and (select count(*) from messages where conversation_id = conv) = n;
  r := svc_ai_checkout_confirm(conv);                                                                       -- a second YES
  ok := ok and r ->> 'error' = 'no_summary' and (select count(*) from orders where contact_id = k) = 1;
  perform set_config('bizriva.system', 'on', true);
  insert into messages(workspace_id, conversation_id, direction, body, status) values (ws, conv, 'out', 'Retry me', 'queued') returning id into m2;
  perform set_config('bizriva.system', '', true);
  perform svc_whatsapp_claim_v2(10);
  perform svc_whatsapp_result(m2, null, '503 Service temporarily unavailable');                            -- WhatsApp was down
  ok := ok and (select status from messages where id = m2) = 'queued' and (select send_attempts from messages where id = m2) = 1;
  perform svc_whatsapp_result(m2, 'wamid.OUT1', null);
  ok := ok and (select status from messages where id = m2) = 'sent' and (select count(*) from messages where body = 'Retry me' and conversation_id = conv) = 1;
  res := array_append(res, '13 ' || ok);

  -- 14. One business cannot read another business's data (full suite: supabase/tests/tenant_isolation.sql).
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner)::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from contacts where workspace_id = other;
  select count(*) into n2 from contacts where workspace_id = ws;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  res := array_append(res, '14 ' || (n = 0 and n2 > 0));

  -- 15. Opt-out stops marketing automation.
  r := svc_whatsapp_inbound(ws, '2348031234567', 'Ada Obi', 'wamid.A9', 'STOP', 'text', now());
  perform set_config('bizriva.system', 'on', true);
  insert into consents(workspace_id, contact_id, channel, category, granted, source, recorded_at) values (ws, k2, 'whatsapp', 'marketing', true, 'order form', now() - interval '1 day');
  insert into campaigns(workspace_id, name, channel, template_name, body, status) values (ws, 'November promo', 'whatsapp', 'win_back', 'Hi {{name}}', 'draft');
  perform set_config('bizriva.system', '', true);
  update campaigns set status = 'scheduled' where workspace_id = ws;
  perform private.whatsapp_expand_broadcasts();
  perform private.followups_tick();
  ok := private.opted_out(k)
        and not exists (select 1 from campaign_recipients where workspace_id = ws and contact_id = k)
        and exists (select 1 from campaign_recipients where workspace_id = ws and contact_id = k2 and message_id is not null)
        and not exists (select 1 from followup_jobs j where j.conversation_id = conv and j.state = 'scheduled');
  res := array_append(res, '15 ' || ok);

  raise exception 'ACCEPTANCE %', array_to_string(res, ' | ');
end $$;
