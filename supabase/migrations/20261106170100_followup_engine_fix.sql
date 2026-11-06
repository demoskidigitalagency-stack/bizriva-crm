-- Fix: name clash in followups_tick (rule variable vs table alias).
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
