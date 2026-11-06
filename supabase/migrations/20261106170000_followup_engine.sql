-- Bizriva CRM — the follow-up engine on the server (2026-11-06).
--
-- Every 5 minutes private.followups_tick():
--   1. cancels scheduled reminders when the customer replied, opted out,
--      a person took over the chat, or the order moved on;
--   2. schedules reminders for chats and orders that match an enabled rule
--      (one job per rule, chat and attempt — never twice);
--   3. sends the ones that are due, if all rules allow:
--        quiet hours (business time zone) → wait;
--        one follow-up per customer per day (settings.followUpDailyCap, default 1);
--        inside 24 hours of the customer's last message → the rule's message;
--        outside → the rule's approved template, otherwise not sent ("needs a template");
--        not sendable → marked failed with the reason (needs_template, no_message);
--        STOP / marketing opt-out → nothing (service reminders included — see docs/DECISIONS.md).
-- Messages go into the normal WhatsApp queue (whatsapp-send).

alter table public.followup_jobs
  add column since timestamptz,
  add column order_id uuid references public.orders(id) on delete cascade,
  add column message_id uuid,
  add column created_at timestamptz not null default now(),
  add column sent_at timestamptz;
create index on public.followup_jobs (workspace_id, state, run_at);


-- Is it quiet hours for this business right now?
create or replace function private.is_quiet(ws uuid, r_start time, r_end time) returns boolean
language sql stable security definer set search_path = public as $$
  select case when s is null or e is null or s = e then false
              when s < e then t >= s and t < e
              else t >= s or t < e end
  from (select coalesce(r_start, nullif(w.settings ->> 'quietStart', '')::time) as s, coalesce(r_end, nullif(w.settings ->> 'quietEnd', '')::time) as e,
               (now() at time zone coalesce(w.timezone, 'Africa/Lagos'))::time as t from workspaces w where w.id = ws) x;
$$;

create or replace function private.opted_out(contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not s.granted from consents s where s.contact_id = contact and s.category = 'marketing' order by s.recorded_at desc limit 1), false);
$$;

-- The customer's WhatsApp chat (created if they never chatted, e.g. came from a form).
create or replace function private.wa_conversation(ws uuid, contact uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare conv uuid; prev text;
begin
  select id into conv from conversations where workspace_id = ws and contact_id = contact and channel = 'whatsapp' order by created_at desc limit 1;
  if conv is null then
    prev := private.sys_on();
    insert into conversations(workspace_id, contact_id, channel) values (ws, contact, 'whatsapp') returning id into conv;
    perform private.sys_restore(prev);
  end if;
  return conv;
end $$;

-- What each rule is watching for: one row per chat that currently matches, with the moment it started.
create or replace function private.followup_candidates() returns table(rule_id uuid, workspace_id uuid, conversation_id uuid, contact_id uuid, order_id uuid, since timestamptz)
language sql volatile security definer set search_path = public as $$
  -- Quiet chats: we wrote after the customer's last message and they haven't answered.
  -- The clock starts at our FIRST message after theirs, so our own reminders don't restart it.
  select r.id, r.workspace_id, c.id, c.contact_id, null::uuid, s.since
  from followup_rules r
  join conversations c on c.workspace_id = r.workspace_id and c.channel = 'whatsapp' and c.status <> 'closed'
  cross join lateral (
    select min(m.created_at) as since, bool_or(m.body ~ '₦\s?\d') as priced
    from messages m where m.conversation_id = c.id and m.direction = 'out'
      and m.created_at > coalesce((select max(m2.created_at) from messages m2 where m2.conversation_id = c.id and m2.direction = 'in'), '-infinity'::timestamptz)
  ) s
  where r.enabled and s.since is not null
    and (r.trigger = 'no_reply_after_details'
      or (r.trigger = 'no_reply_after_price' and s.priced)
      or (r.trigger = 'checkout_abandoned' and c.checkout is not null))
    and not exists (select 1 from orders o where o.contact_id = c.contact_id and o.created_at > s.since)
  union all
  -- Deliveries that didn't happen and can be rebooked.
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id, coalesce(d.delivered_at, d.dispatched_at, o.created_at)
  from followup_rules r join orders o on o.workspace_id = r.workspace_id join deliveries d on d.order_id = o.id
  where r.enabled and r.trigger = 'delivery_failed' and d.outcome in ('unreachable', 'rescheduled') and o.status not in ('delivered', 'cancelled', 'returned', 'refused')
  union all
  -- Agents couldn't reach the customer (two or more unanswered calls, order still waiting).
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id, a.last_at
  from followup_rules r join orders o on o.workspace_id = r.workspace_id
  cross join lateral (select max(x.at) as last_at, count(*) filter (where x.outcome in ('no_answer', 'busy')) as missed, bool_or(x.outcome = 'reached') as reached
                      from order_contact_attempts x where x.order_id = o.id) a
  where r.enabled and r.trigger = 'unreachable' and o.status = 'pending_verification' and a.missed >= 2 and not coalesce(a.reached, false)
  union all
  -- Cancelled orders worth winning back.
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id,
    coalesce((select max(l.created_at) from activity_log l where l.entity = 'order' and l.entity_id = o.id), o.created_at)
  from followup_rules r join orders o on o.workspace_id = r.workspace_id
  where r.enabled and r.trigger = 'order_cancelled' and o.status = 'cancelled' and o.created_at > now() - interval '30 days'
  union all
  -- Time to re-order: delivered, and the product usually runs out about now.
  select r.id, r.workspace_id, private.wa_conversation(o.workspace_id, o.contact_id), o.contact_id, o.id, d.delivered_at + make_interval(days => p.reorder_days)
  from followup_rules r join orders o on o.workspace_id = r.workspace_id join deliveries d on d.order_id = o.id
  cross join lateral (select max(pp.reorder_days) as reorder_days from order_items i join products pp on pp.id = i.product_id where i.order_id = o.id and pp.reorder_days > 0) p
  where r.enabled and r.trigger = 'reorder_due' and o.status = 'delivered' and d.delivered_at is not null and p.reorder_days is not null
    and d.delivered_at + make_interval(days => p.reorder_days) between now() - interval '14 days' and now() + interval '7 days'
    and not exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.created_at > d.delivered_at);
$$;

create or replace function private.fill_followup(txt text, contact uuid, ord uuid) returns text
language sql stable security definer set search_path = public as $$
  select replace(replace(replace(coalesce(txt, ''), '{{name}}', coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there')),
    '{{order}}', coalesce((select ref from orders where id = ord), 'your order')),
    '{{product}}', coalesce((select p.name from order_items i join products p on p.id = i.product_id where i.order_id = ord limit 1), 'the item you asked about'))
  from contacts k where k.id = contact;
$$;

create or replace function private.followups_tick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev text; j record; r followup_rules; c conversations; in_window boolean; mid uuid; n_sched int := 0; n_sent int := 0; n_cancel int := 0; n_skip int := 0; cap int; body text;
begin
  prev := private.sys_on();

  -- 1. Cancel what no longer applies.
  update followup_jobs fj set state = 'cancelled', cancel_reason = x.reason
  from (
    select fj2.id, case
      when exists (select 1 from messages m where m.conversation_id = fj2.conversation_id and m.direction = 'in' and m.created_at > fj2.since) then 'replied'
      when private.opted_out(cv.contact_id) then 'opted_out'
      when cv.handled_by = 'human' and fj2.order_id is null then 'human_takeover'
      when not exists (select 1 from private.followup_candidates() fc where fc.rule_id = fj2.rule_id and fc.conversation_id = fj2.conversation_id) then 'no_longer_applies'
    end as reason
    from followup_jobs fj2 join conversations cv on cv.id = fj2.conversation_id where fj2.state = 'scheduled'
  ) x where fj.id = x.id and x.reason is not null;
  get diagnostics n_cancel = row_count;

  -- 2. Schedule: the next attempt for each match, unless that attempt already exists.
  insert into followup_jobs(workspace_id, rule_id, conversation_id, order_id, since, attempt, run_at)
  select fc.workspace_id, fc.rule_id, fc.conversation_id, fc.order_id, fc.since,
         coalesce((select max(attempt) from followup_jobs z where z.rule_id = fc.rule_id and z.conversation_id = fc.conversation_id and z.since = fc.since), 0) + 1,
         fc.since + make_interval(hours => fr.delay_hours * (coalesce((select count(*) from followup_jobs z where z.rule_id = fc.rule_id and z.conversation_id = fc.conversation_id and z.since = fc.since and z.state = 'sent'), 0) + 1)::int)
  from private.followup_candidates() fc join followup_rules fr on fr.id = fc.rule_id left join conversations cv on cv.id = fc.conversation_id
  where not exists (select 1 from followup_jobs z where z.rule_id = fc.rule_id and z.conversation_id = fc.conversation_id and z.since = fc.since and z.state = 'scheduled')
    and (select count(*) from followup_jobs z where z.rule_id = fc.rule_id and z.conversation_id = fc.conversation_id and z.since = fc.since and z.state in ('sent', 'failed')) < fr.max_attempts
    and not exists (select 1 from messages m where m.conversation_id = fc.conversation_id and m.direction = 'in' and m.created_at > fc.since)
    and not private.opted_out(fc.contact_id)
    and not (coalesce(cv.handled_by::text, 'ai') = 'human' and fc.order_id is null)
  on conflict (rule_id, conversation_id, attempt) do nothing;
  get diagnostics n_sched = row_count;

  -- 3. Send what's due.
  for j in select * from followup_jobs where state = 'scheduled' and run_at <= now() order by run_at for update skip locked limit 200 loop
    select * into r from followup_rules where id = j.rule_id;
    select * into c from conversations where id = j.conversation_id;
    if private.is_quiet(j.workspace_id, r.quiet_start, r.quiet_end) then continue; end if;   -- wait for morning
    select coalesce(nullif(settings ->> 'followUpDailyCap', '')::int, 1) into cap from workspaces where id = j.workspace_id;
    if (select count(*) from followup_jobs z join conversations cz on cz.id = z.conversation_id
        where cz.contact_id = c.contact_id and z.state = 'sent' and z.sent_at > now() - interval '24 hours') >= cap then continue; end if;
    in_window := coalesce(c.last_inbound_at > now() - interval '24 hours', false);
    body := private.fill_followup(r.message, c.contact_id, j.order_id);
    if not in_window and coalesce(r.template_name, '') = '' then
      update followup_jobs set state = 'failed', cancel_reason = 'needs_template' where id = j.id; n_skip := n_skip + 1; continue;
    end if;
    if in_window and btrim(body) = '' then
      update followup_jobs set state = 'failed', cancel_reason = 'no_message' where id = j.id; n_skip := n_skip + 1; continue;
    end if;
    insert into messages(workspace_id, conversation_id, direction, body, status, template_name)
      values (j.workspace_id, j.conversation_id, 'out', nullif(btrim(body), ''), 'queued', case when in_window then null else r.template_name end)
      returning id into mid;
    update followup_jobs set state = 'sent', sent_at = now(), message_id = mid where id = j.id;
    n_sent := n_sent + 1;
  end loop;

  perform private.sys_restore(prev);
  return jsonb_build_object('scheduled', n_sched, 'sent', n_sent, 'cancelled', n_cancel, 'skipped', n_skip);
end $$;
revoke execute on function private.followups_tick() from public, anon, authenticated;

select cron.schedule('bizriva-followups', '*/5 * * * *', $job$ select private.followups_tick() $job$);
