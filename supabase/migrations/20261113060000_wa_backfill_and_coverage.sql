-- Older WhatsApp messages and what's been brought in so far.
--
-- "Bring in older messages": the worker asks the owner's phone, chat by chat, for the 50
-- messages before the oldest one Bizriva has, in rounds, until a round brings nothing new
-- or the chats reach back 12 months. The phone must be online; WhatsApp decides how far
-- back each chat goes. Progress shows on WhatsApp Growth and Live status.

alter table public.wa_links
  add column backfill_status text check (backfill_status in ('queued', 'running', 'done', 'failed')),
  add column backfill_round int not null default 0,
  add column backfill_done int not null default 0,
  add column backfill_total int not null default 0,
  add column backfill_added int not null default 0,
  add column backfill_at timestamptz,
  add column backfill_error text check (length(backfill_error) <= 300);

create or replace function public.request_wa_backfill(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur wa_links;
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into cur from wa_links where workspace_id = p_workspace;
  if cur.id is null or cur.status <> 'connected' then raise exception 'Link your WhatsApp first'; end if;
  if cur.backfill_status in ('queued', 'running') then return; end if;
  update wa_links set backfill_status = 'queued', backfill_round = 0, backfill_done = 0, backfill_total = 0, backfill_added = 0, backfill_at = now(), backfill_error = null where id = cur.id;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail) values (p_workspace, auth.uid(), 'workspace', p_workspace, 'whatsapp_backfill_requested', null);
end $$;

-- Month by month: what's in Bizriva from the linked WhatsApp.
create or replace function public.wa_history_coverage(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'oldest', (select min(created_at) from messages where workspace_id = p_workspace and provider_message_id like 'wa:%'),
    'newest', (select max(created_at) from messages where workspace_id = p_workspace and provider_message_id like 'wa:%'),
    'messages', (select count(*) from messages where workspace_id = p_workspace and provider_message_id like 'wa:%'),
    'chats', (select count(distinct conversation_id) from messages where workspace_id = p_workspace and provider_message_id like 'wa:%'),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(mo, 'YYYY-MM'), 'messages', msgs, 'chats', chats) order by mo desc)
      from (select date_trunc('month', created_at at time zone 'Africa/Lagos') mo, count(*) msgs, count(distinct conversation_id) chats
            from messages where workspace_id = p_workspace and provider_message_id like 'wa:%' group by 1) x), '[]'));
end $$;

-- ───── for the worker ─────
-- The heartbeat now also says whether older messages were asked for.
drop function public.svc_wa_worker_beat(text, int);
create function public.svc_wa_worker_beat(p_version text, p_links int)
returns table(id uuid, workspace_id uuid, phone text, method text, status text, backfill_status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update private.wa_worker set last_at = now(), version = left(p_version, 40), links = greatest(coalesce(p_links, 0), 0) where private.wa_worker.id;
  return query select l.id, l.workspace_id, l.phone, l.method, l.status, l.backfill_status from wa_links l where l.status not in ('logged_out', 'failed');
end $$;

-- The oldest message Bizriva has in each chat from this number, oldest chats last (busiest first).
create or replace function public.svc_wa_backfill_targets(p_link uuid, p_months int)
returns table(wa text, msg_id text, from_me boolean, at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (ci.external_id) ci.external_id, substr(m.provider_message_id, 4), m.direction = 'out', m.created_at
  from wa_links l
  join conversations c on c.workspace_id = l.workspace_id and c.channel = 'whatsapp'
  join contact_identities ci on ci.contact_id = c.contact_id and ci.channel = 'whatsapp'
  join messages m on m.conversation_id = c.id and m.provider_message_id like 'wa:%'
  where l.id = p_link
  order by ci.external_id, m.created_at asc
$$;

-- Keys: status, round, done, total, added (added is added to the running total), error.
create or replace function public.svc_wa_backfill_progress(p_link uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  update wa_links set
    backfill_status = coalesce(p_patch ->> 'status', backfill_status),
    backfill_round = coalesce((p_patch ->> 'round')::int, backfill_round),
    backfill_done = coalesce((p_patch ->> 'done')::int, backfill_done),
    backfill_total = coalesce((p_patch ->> 'total')::int, backfill_total),
    backfill_added = backfill_added + coalesce((p_patch ->> 'added')::int, 0),
    backfill_error = case when p_patch ? 'error' then left(p_patch ->> 'error', 300) else backfill_error end,
    backfill_at = now()
  where id = p_link returning workspace_id into ws;
  if p_patch ->> 'status' = 'done' then
    insert into activity_log(workspace_id, entity, entity_id, action, detail)
      select ws, 'workspace', ws, 'whatsapp_backfill_done', jsonb_build_object('added', backfill_added, 'rounds', backfill_round) from wa_links where id = p_link;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_wa_worker_beat(text, int)', 'svc_wa_backfill_targets(uuid, int)', 'svc_wa_backfill_progress(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['request_wa_backfill(uuid)', 'wa_history_coverage(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Live status shows older messages coming in (and if it stopped).
create or replace function public.activity_status(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lk wa_links; wn whatsapp_numbers; ak ai_keys; mp meta_pages; online boolean := private.wa_worker_online();
  channels jsonb := '[]'; running jsonb := '[]'; problems jsonb := '[]'; n int; m int; t timestamptz; r record;
  day_start timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;

  -- ───── connections ─────
  select * into lk from wa_links where workspace_id = p_workspace;
  if lk.id is not null then
    channels := channels || jsonb_build_object('key', 'wa_link', 'name', 'WhatsApp (linked number)',
      'state', case when lk.status = 'connected' and online then 'ok' when lk.status in ('pending', 'waiting', 'reconnecting', 'unlinking') then 'working' else 'problem' end,
      'detail', case when lk.status = 'connected' and not online then 'Bizriva''s WhatsApp server is not answering — messages wait until it''s back'
                     when lk.status = 'connected' then '+' || lk.phone || coalesce(' · ' || lk.wa_name, '') || ' · linked'
                     when lk.status = 'waiting' then 'Waiting for the code to be entered on the phone'
                     when lk.status = 'pending' then 'Getting a code from WhatsApp'
                     when lk.status = 'reconnecting' then 'Reconnecting to WhatsApp'
                     else coalesce(lk.last_error, lk.status) end,
      'at', coalesce(lk.last_seen_at, lk.created_at));
    if lk.status = 'connected' and not online then
      problems := problems || jsonb_build_object('key', 'wa_server', 'title', 'WhatsApp server offline', 'detail', 'New messages and replies are paused until Bizriva''s WhatsApp server is back.', 'at', (select last_at from private.wa_worker));
    elsif lk.status in ('logged_out', 'failed') then
      problems := problems || jsonb_build_object('key', 'wa_link', 'title', 'WhatsApp isn''t linked', 'detail', coalesce(lk.last_error, 'Link your number again on WhatsApp Growth.'), 'at', lk.last_seen_at);
    end if;
    if lk.history_status = 'syncing' then
      running := running || jsonb_build_object('key', 'wa_history', 'title', 'Bringing in old WhatsApp chats', 'state', 'running',
        'done', lk.history_messages, 'total', null, 'unit', 'messages',
        'detail', lk.history_chats || ' chats so far · keep WhatsApp open on the phone', 'at', lk.last_seen_at, 'link', '/whatsapp');
    end if;
    if lk.backfill_status in ('queued', 'running') then
      running := running || jsonb_build_object('key', 'wa_backfill', 'title', 'Bringing in older WhatsApp messages', 'state', 'running',
        'done', lk.backfill_done, 'total', nullif(lk.backfill_total, 0), 'unit', 'chats',
        'detail', case when lk.backfill_round > 0 then 'Round ' || lk.backfill_round || ' · ' else '' end || lk.backfill_added || ' older messages so far · keep WhatsApp open on the phone',
        'at', lk.backfill_at, 'link', '/whatsapp');
    elsif lk.backfill_status = 'failed' then
      problems := problems || jsonb_build_object('key', 'wa_backfill', 'title', 'Bringing in older messages stopped', 'detail', lk.backfill_error, 'at', lk.backfill_at, 'link', '/whatsapp');
    end if;
  end if;

  select * into wn from whatsapp_numbers where workspace_id = p_workspace;
  if wn.workspace_id is not null then
    channels := channels || jsonb_build_object('key', 'wa_cloud', 'name', 'WhatsApp (Meta)',
      'state', case when not wn.active or wn.last_error is not null then 'problem' else 'ok' end,
      'detail', coalesce(wn.display_phone, wn.phone_number_id) || case when not wn.active then ' · disconnected' when wn.last_error is not null then ' · ' || left(wn.last_error, 120) else ' · connected' end,
      'at', greatest(wn.last_inbound_at, wn.last_sent_at, wn.connected_at));
    if wn.history_status = 'syncing' then
      running := running || jsonb_build_object('key', 'wa_cloud_history', 'title', 'Bringing in chats from the phone (Meta)', 'state', 'running',
        'done', coalesce(wn.history_progress, 0), 'total', 100, 'unit', '%', 'detail', wn.history_messages || ' messages from ' || wn.history_chats || ' chats', 'at', wn.sync_requested_at, 'link', '/integrations');
    end if;
  end if;

  select * into ak from ai_keys where workspace_id = p_workspace;
  channels := channels || jsonb_build_object('key', 'ai', 'name', 'AI assistant',
    'state', case when ak.workspace_id is null then 'off' when not ak.active or ak.last_error is not null then 'problem' else 'ok' end,
    'detail', case when ak.workspace_id is null then 'No AI key — the free Basic assistant answers' when ak.last_error is not null then left(ak.last_error, 160) else 'Answering customers' end,
    'at', ak.last_used_at);
  if ak.last_error is not null then
    problems := problems || jsonb_build_object('key', 'ai', 'title', 'The AI assistant had a problem', 'detail', left(ak.last_error, 200), 'at', ak.last_used_at);
  end if;

  select * into mp from meta_pages where workspace_id = p_workspace;
  if mp.workspace_id is not null then
    channels := channels || jsonb_build_object('key', 'meta_page', 'name', 'Facebook & Instagram',
      'state', case when not mp.active or mp.last_error is not null then 'problem' else 'ok' end,
      'detail', coalesce(mp.page_name, mp.page_id) || coalesce(' · ' || left(mp.last_error, 120), ''), 'at', greatest(mp.last_event_at, mp.last_sent_at));
  end if;

  -- ───── running and waiting ─────
  select count(*), min(x.created_at) into n, t from messages x join conversations c on c.id = x.conversation_id
    where x.workspace_id = p_workspace and x.direction = 'out' and x.status = 'queued' and c.channel = 'whatsapp';
  if n > 0 then
    running := running || jsonb_build_object('key', 'wa_out', 'title', 'Sending WhatsApp messages', 'state', 'running', 'done', null, 'total', n, 'unit', 'waiting',
      'detail', n || ' waiting to go out, paced to protect your number', 'at', t, 'link', '/inbox');
  end if;

  for r in select cp.id, cp.name, cp.channel, cp.status, cp.scheduled_for, cp.created_at,
      (select count(*) from campaign_recipients cr where cr.campaign_id = cp.id) as total,
      (select count(*) from campaign_recipients cr where cr.campaign_id = cp.id and (cr.delivered_at is not null or cr.message_id is not null or cr.skipped_reason is not null)) as done
    from campaigns cp where cp.workspace_id = p_workspace and cp.status in ('sending', 'scheduled') order by coalesce(cp.scheduled_for, cp.created_at) limit 10 loop
    running := running || jsonb_build_object('key', 'campaign:' || r.id, 'title', case when r.status = 'sending' then 'Sending campaign: ' else 'Scheduled campaign: ' end || r.name,
      'state', case when r.status = 'sending' then 'running' else 'waiting' end, 'done', r.done, 'total', r.total, 'unit', 'people',
      'detail', initcap(r.channel) || case when r.status = 'scheduled' then ' · starts ' || to_char(r.scheduled_for at time zone 'Africa/Lagos', 'Dy DD Mon HH24:MI') else '' end,
      'at', coalesce(r.scheduled_for, r.created_at), 'link', '/broadcasts');
  end loop;

  select count(*), min(created_at) into n, t from email_outbox where workspace_id = p_workspace and status = 'queued';
  if n > 0 then
    running := running || jsonb_build_object('key', 'email_out', 'title', 'Sending emails', 'state', 'running', 'done', null, 'total', n, 'unit', 'waiting', 'detail', n || ' emails waiting to go out', 'at', t);
  end if;

  select count(*) filter (where run_at <= now() + interval '24 hours'), count(*), min(run_at) into n, m, t from followup_jobs where workspace_id = p_workspace and state = 'scheduled';
  if m > 0 then
    running := running || jsonb_build_object('key', 'followups', 'title', 'Follow-ups scheduled', 'state', 'waiting', 'done', null, 'total', m, 'unit', 'scheduled',
      'detail', n || ' due in the next 24 hours · next ' || to_char(t at time zone 'Africa/Lagos', 'Dy HH24:MI'), 'at', t, 'link', '/follow-ups');
  end if;

  -- ───── problems in the last 24 hours ─────
  for r in select coalesce(nullif(left(x.error, 140), ''), 'Unknown reason') as reason, count(*) as cnt, max(x.created_at) as last_at
    from messages x where x.workspace_id = p_workspace and x.direction = 'out' and x.status = 'failed' and x.created_at > now() - interval '24 hours'
    group by 1 order by 2 desc limit 3 loop
    problems := problems || jsonb_build_object('key', 'failed:' || md5(r.reason), 'title', r.cnt || ' message' || case when r.cnt > 1 then 's' else '' end || ' didn''t send', 'detail', r.reason, 'at', r.last_at, 'link', '/inbox');
  end loop;
  select count(*), max(created_at) into n, t from email_outbox where workspace_id = p_workspace and status = 'failed' and created_at > now() - interval '24 hours';
  if n > 0 then
    problems := problems || jsonb_build_object('key', 'email_failed', 'title', n || ' email' || case when n > 1 then 's' else '' end || ' didn''t send',
      'detail', (select left(error, 140) from email_outbox where workspace_id = p_workspace and status = 'failed' order by created_at desc limit 1), 'at', t);
  end if;

  return jsonb_build_object(
    'checkedAt', now(),
    'channels', channels, 'running', running, 'problems', problems,
    'today', jsonb_build_object(
      'messagesIn', (select count(*) from messages where workspace_id = p_workspace and direction = 'in' and not coalesce(imported, false) and created_at >= day_start),
      'messagesOut', (select count(*) from messages where workspace_id = p_workspace and direction = 'out' and status in ('sent', 'delivered', 'read') and not coalesce(imported, false) and created_at >= day_start),
      'newContacts', (select count(*) from contacts where workspace_id = p_workspace and created_at >= day_start),
      'orders', (select count(*) from orders where workspace_id = p_workspace and created_at >= day_start),
      'followupsSent', (select count(*) from followup_jobs where workspace_id = p_workspace and state = 'sent' and sent_at >= day_start)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'entity', a.entity, 'detail', a.detail, 'at', a.created_at,
                          'by', (select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)) from auth.users u where u.id = a.actor)) order by a.created_at desc)
                        from (select * from activity_log where workspace_id = p_workspace order by created_at desc limit 30) a), '[]'));
end $$;
revoke execute on function public.activity_status(uuid) from public, anon;
grant execute on function public.activity_status(uuid) to authenticated;
