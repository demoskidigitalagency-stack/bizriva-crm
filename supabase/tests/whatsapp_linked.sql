-- Linked-device WhatsApp (20261113010000/020000). Run in the SQL editor; always rolls back.
-- Last run 2026-11-13: 17/17 true.
do $$
declare ws uuid; lk uuid; r jsonb; h text; pid uuid; cid uuid; conv uuid; mid uuid; n int; t text[]; c int; checks text := '';
begin
  select w.id into ws from workspaces w where not exists (select 1 from whatsapp_numbers x where x.workspace_id = w.id) order by created_at limit 1;
  insert into products(workspace_id, name, price, active) values (ws, 'Zebra Test Dryer', 12000, true) returning id into pid;
  insert into wa_links(workspace_id, phone, risk_ack_at) values (ws, '2348030009999', now()) returning id into lk;
  h := svc_wa_link_patch(lk, '{"status":"connected","wa_name":"Shop"}');
  checks := checks || 'first connect syncing=' || (h = 'syncing') || '; ';
  r := svc_wa_history(lk, '[{"wa":"2348039990001","name":"Kemi Test","messages":[{"id":"wa:T1","at":"2026-01-01T10:00:00Z","out":false,"body":"How much is the zebra test dryer?"},{"id":"wa:T2","at":"2026-01-01T10:01:00Z","out":true,"body":"N12,000"}]},{"wa":"2348039990002","name":null,"messages":[{"id":"wa:T3","at":"2026-01-02T10:00:00Z","out":false,"body":"hello"}]},{"wa":"bad","messages":[]}]', false);
  checks := checks || 'history added 3 chats 2=' || (r->>'added' = '3' and r->>'chats' = '2') || '; ';
  r := svc_wa_history(lk, '[{"wa":"2348039990001","messages":[{"id":"wa:T1","at":"2026-01-01T10:00:00Z","out":false,"body":"dup"}]}]', false);
  checks := checks || 'duplicates skipped=' || (r->>'added' = '0') || '; ';
  select contact_id into cid from contact_identities where workspace_id = ws and channel = 'whatsapp' and external_id = '2348039990001';
  checks := checks || 'name saved=' || ((select name from contacts where id = cid) = 'Kemi Test') || '; ';
  checks := checks || 'imported=' || (select bool_and(imported) from messages where workspace_id = ws and provider_message_id in ('wa:T1','wa:T2','wa:T3')) || '; ';
  r := svc_wa_history(lk, '[]', true);
  select tags into t from contacts where id = cid;
  checks := checks || 'tagged product=' || ('Asked about: Zebra Test Dryer' = any(t)) || ' no order=' || ('No order yet' = any(t)) || '; ';
  checks := checks || 'lead interest=' || exists(select 1 from leads where contact_id = cid and product_interest_id = pid) || '; ';
  checks := checks || 'done=' || ((select history_status from wa_links where id = lk) = 'done') || '; ';
  r := svc_wa_history(lk, '[{"wa":"2348039990003","messages":[{"id":"wa:T9","at":"2026-01-03T10:00:00Z","out":false,"body":"late"}]}]', false);
  checks := checks || 'stays done=' || ((select history_status from wa_links where id = lk) = 'done') || '; ';
  n := svc_wa_names(lk, '[{"phone":"2348039990002","name":"Tunde From Phone"},{"phone":"2348039990001","name":"Should Not Replace"}]');
  checks := checks || 'names fill blanks only=' || (n = 1 and (select name from contacts where id = cid) = 'Kemi Test') || '; ';
  select id into conv from conversations where contact_id = cid and channel = 'whatsapp' limit 1;
  insert into messages(workspace_id, conversation_id, direction, body, status, purpose) values (ws, conv, 'out', 'Still interested?', 'queued', 'service') returning id into mid;
  insert into contacts(workspace_id, name, phone) values (ws, 'Cold', '+2348039990077') returning id into cid;
  insert into contact_identities(workspace_id, contact_id, channel, external_id) values (ws, cid, 'whatsapp', '2348039990077');
  insert into conversations(workspace_id, contact_id, channel) values (ws, cid, 'whatsapp') returning id into conv;
  insert into messages(workspace_id, conversation_id, direction, body, status, purpose) values (ws, conv, 'out', 'Promo!', 'queued', 'marketing');
  select count(*) into c from svc_wa_claim(lk, 10) x where x.id = mid and x.to_wa = '2348039990001';
  checks := checks || 'claims reply to Kemi=' || (c = 1) || '; ';
  checks := checks || 'cold number failed=' || ((select status::text from messages where conversation_id = conv) = 'failed') || '; ';
  perform svc_whatsapp_result(mid, 'wa:SENT1', null);
  checks := checks || 'sent recorded=' || ((select status::text from messages where id = mid) = 'sent') || '; ';
  perform svc_wa_auth_put(lk, '{"creds":"enc1","k2":"enc2"}');
  perform svc_wa_auth_put(lk, '{"k2":null,"creds":"enc3"}');
  checks := checks || 'session store=' || ((select string_agg(k||'='||v, ',') from svc_wa_auth_all(lk)) = 'creds=enc3') || '; ';
  checks := checks || 'phone norm=' || (private.wa_phone('0803 123 4567') = '2348031234567') || '; ';
  checks := checks || 'worker offline=' || (not private.wa_worker_online()) || '; ';
  perform svc_wa_worker_beat('test', 0);
  checks := checks || 'worker online after beat=' || private.wa_worker_online();
  raise exception 'RESULT: %', checks;
end $$;
