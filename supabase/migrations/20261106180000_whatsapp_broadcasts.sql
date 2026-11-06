-- Bizriva CRM — WhatsApp broadcasts are sent for real (2026-11-06).
--
-- A WhatsApp campaign set to "scheduled" (Broadcasts → Send) becomes one queued
-- message per customer whose latest marketing consent is yes and who has a
-- phone number. Customers inside 24 hours of their last message get the text;
-- everyone else gets the campaign's approved template (WhatsApp's rule). With
-- no template, only the in-window customers are messaged and the rest are
-- recorded as not sent. Each customer is messaged once per campaign.

alter table public.campaign_recipients add column message_id uuid, add column skipped_reason text;

create or replace function private.whatsapp_expand_broadcasts() returns int
language plpgsql security definer set search_path = public as $$
declare c campaigns; prev text; n int := 0; k record; conv uuid; inwin boolean; mid uuid;
begin
  prev := private.sys_on();
  for c in select * from campaigns where channel = 'whatsapp' and status = 'scheduled' and coalesce(scheduled_for, now()) <= now() for update skip locked loop
    update campaigns set status = 'sending' where id = c.id;
    for k in
      select ct.id, coalesce(nullif(split_part(btrim(ct.name), ' ', 1), ''), 'there') as first
      from contacts ct
      where ct.workspace_id = c.workspace_id and length(private.phone_key(ct.phone)) >= 10
        and (select s.granted from consents s where s.contact_id = ct.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is true
        and not exists (select 1 from campaign_recipients r where r.campaign_id = c.id and r.contact_id = ct.id)
      limit 5000
    loop
      conv := private.wa_conversation(c.workspace_id, k.id);
      select coalesce(last_inbound_at > now() - interval '24 hours', false) into inwin from conversations where id = conv;
      if not inwin and coalesce(c.template_name, '') = '' then
        insert into campaign_recipients(campaign_id, workspace_id, contact_id, skipped_reason) values (c.id, c.workspace_id, k.id, 'needs_template') on conflict do nothing;
        continue;
      end if;
      insert into messages(workspace_id, conversation_id, direction, body, status, template_name)
        values (c.workspace_id, conv, 'out', nullif(replace(coalesce(c.body, ''), '{{name}}', k.first), ''), 'queued', case when inwin then null else c.template_name end)
        returning id into mid;
      insert into campaign_recipients(campaign_id, workspace_id, contact_id, message_id) values (c.id, c.workspace_id, k.id, mid) on conflict do nothing;
      n := n + 1;
    end loop;
    update campaigns set status = 'sent', sent_at = now() where id = c.id;
  end loop;
  perform private.sys_restore(prev);
  return n;
end $$;
revoke execute on function private.whatsapp_expand_broadcasts() from public, anon, authenticated;

select cron.schedule('bizriva-wa-broadcasts', '* * * * *', $job$
  select private.whatsapp_expand_broadcasts() where exists (select 1 from public.campaigns where channel = 'whatsapp' and status = 'scheduled' and coalesce(scheduled_for, now()) <= now())
$job$);
