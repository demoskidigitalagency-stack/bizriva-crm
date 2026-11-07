-- Connect WhatsApp with Meta + Coexistence: run with execute_sql; everything rolls back (final raise).
-- Expected: RESULTS {"verify true","nonadmin refused true","admin saved true","manager refused true","connected with platform secret true",
--   "number taken true","contacts true","history true","echo true","declined+removed true","manual needs secret true"}
do $$
declare ws uuid; other uuid; owner uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); r jsonb; conv uuid; res text[] := '{}'; ok boolean; err text; tok uuid;
begin
  insert into auth.users(id, email, aud, role) values (owner, 'co-owner@test.invalid', 'authenticated', 'authenticated'), (mgr, 'co-mgr@test.invalid', 'authenticated', 'authenticated');
  perform set_config('bizriva.system', 'on', true);
  insert into workspaces(name) values ('Coexist Shop') returning id into ws;
  insert into workspaces(name) values ('Other Shop') returning id into other;
  insert into workspace_members(workspace_id, user_id, role) values (ws, owner, 'owner'), (ws, mgr, 'manager');
  perform set_config('bizriva.system', '', true);
  ok := svc_whatsapp_verify((select verify_token from private.platform_meta)) and not svc_whatsapp_verify('nope');
  res := res || ('verify ' || ok);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin perform admin_set_meta('123456789012', '987654321098', 'appsecret-0123456789abcdef'); err := 'allowed'; exception when others then err := sqlerrm; end;
  res := res || ('nonadmin refused ' || (err = 'Super Admin only'));
  insert into platform_admins(user_id) values (owner);
  perform admin_set_meta('123456789012', '987654321098', 'appsecret-0123456789abcdef');
  ok := (platform_meta() ->> 'ready')::boolean and admin_meta_settings() ->> 'appId' = '123456789012' and (admin_meta_settings() ->> 'hasSecret')::boolean;
  res := res || ('admin saved ' || ok);
  begin perform svc_whatsapp_partner_connect(ws, mgr, '555000111', '666000111', '+234 803 000 0000', 'EAAG-token-0123456789abcdef', true, null); err := 'allowed'; exception when others then err := sqlerrm; end;
  res := res || ('manager refused ' || (err like 'Only the owner%'));
  perform svc_whatsapp_partner_connect(ws, owner, '555000111', '666000111', '+234 803 000 0000', 'EAAG-token-0123456789abcdef', true, null);
  ok := (select via = 'partner' and on_app and app_secret_id is null from whatsapp_numbers where workspace_id = ws)
    and (select app_secret from svc_whatsapp_keys('555000111')) = 'appsecret-0123456789abcdef'
    and (select token from svc_whatsapp_keys_by_waba('666000111')) = 'EAAG-token-0123456789abcdef';
  res := res || ('connected with platform secret ' || ok);
  perform set_config('bizriva.system', 'on', true);
  insert into workspace_members(workspace_id, user_id, role) values (other, owner, 'owner');
  perform set_config('bizriva.system', '', true);
  begin perform svc_whatsapp_partner_connect(other, owner, '555000111', '666000222', null, 'EAAG-token-0123456789abcdef', false, '123456'); err := 'allowed'; exception when others then err := sqlerrm; end;
  res := res || ('number taken ' || (err like '%already connected%'));
  perform svc_whatsapp_sync_requested(ws, null);
  perform svc_whatsapp_contacts(ws, '[{"phone":"2348031110000","name":"Kemi Bello","action":"add"},{"phone":"2348031110001","action":"remove"},{"phone":"bad","name":"x","action":"add"}]'::jsonb);
  ok := (select contacts_synced from whatsapp_numbers where workspace_id = ws) = 1 and exists (select 1 from contacts where workspace_id = ws and name = 'Kemi Bello' and phone = '+2348031110000');
  res := res || ('contacts ' || ok);
  r := svc_whatsapp_history(ws, 40, jsonb_build_array(
    jsonb_build_object('wa', '2348031110000', 'messages', jsonb_build_array(jsonb_build_object('id','wamid.H1','at','2026-09-01T10:00:00Z','out',false,'body','How much is the cream?'), jsonb_build_object('id','wamid.H2','at','2026-09-01T10:05:00Z','out',true,'body','₦12,000'))),
    jsonb_build_object('wa', '2348039990000', 'messages', jsonb_build_array(jsonb_build_object('id','wamid.H3','at',now() - interval '1 hour','out',false,'body','Hello, are you open?')))));
  r := r || svc_whatsapp_history(ws, 100, jsonb_build_array(jsonb_build_object('wa', '2348031110000', 'messages', jsonb_build_array(jsonb_build_object('id','wamid.H1','at','2026-09-01T10:00:00Z','out',false,'body','How much is the cream?')))));
  select c.id into conv from conversations c join contact_identities i on i.contact_id = c.contact_id and i.external_id = '2348039990000' where c.workspace_id = ws;
  ok := (select history_messages = 3 and history_chats = 2 and history_status = 'done' and history_progress = 100 from whatsapp_numbers where workspace_id = ws)
    and (select count(*) from messages where workspace_id = ws and imported) = 3
    and not exists (select 1 from private.ai_waiting where conversation_id = conv)
    and (select last_inbound_at from conversations where id = conv) is null
    and exists (select 1 from activity_log where workspace_id = ws and action = 'whatsapp_history_imported');
  res := res || ('history ' || ok);
  r := svc_whatsapp_inbound(ws, '2348039990000', null, 'wamid.L1', 'Do you deliver to Ibadan?', 'text', now());
  ok := exists (select 1 from private.ai_waiting where conversation_id = conv);
  r := svc_whatsapp_echo(ws, '2348039990000', 'wamid.E1', 'Yes we do, ₦3,000', now());
  ok := ok and r ->> 'status' = 'saved' and (select handled_by = 'human' from conversations where id = conv)
    and not exists (select 1 from private.ai_waiting where conversation_id = conv)
    and (svc_whatsapp_echo(ws, '2348039990000', 'wamid.E1', 'Yes we do, ₦3,000', now()) ->> 'status') = 'duplicate';
  res := res || ('echo ' || ok);
  perform svc_whatsapp_history_error(ws, '2593109', 'off');
  ok := (select history_status = 'declined' and history_error like 'Chat history sharing%' from whatsapp_numbers where workspace_id = ws);
  perform svc_whatsapp_partner_removed('666000111', 'PARTNER_REMOVED');
  ok := ok and (select not active from whatsapp_numbers where workspace_id = ws);
  res := res || ('declined+removed ' || ok);
  perform set_config('bizriva.system', 'on', true);
  tok := vault.create_secret('x-token-xxxxxxxxxxxxxxxxxxxxxxx', 'cotest_' || other);
  begin insert into whatsapp_numbers(workspace_id, phone_number_id, token_secret_id) values (other, '777000111', tok); err := 'allowed'; exception when others then err := sqlerrm; end;
  res := res || ('manual needs secret ' || (err like '%whatsapp_numbers_secret%'));
  raise exception 'RESULTS %', res;
end $$;
