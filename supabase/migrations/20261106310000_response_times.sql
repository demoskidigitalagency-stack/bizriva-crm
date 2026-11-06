-- Bizriva CRM — how fast customers get answered, and how fast orders get confirmed (2026-11-06).
--
-- A "wait" starts when a customer writes after we last wrote (or for the first
-- time) and ends at our next reply. Replies are credited to whoever sent them:
-- a teammate (sent_by), the AI (by_ai), or an automatic message. Imported
-- history and service updates (order notices, receipts) are left out.
-- Times are plain clock minutes (nights and weekends count), so quiet-hours
-- chats show as slow — that's what the customer feels.
-- Orders: minutes from an order being created to an agent confirming it, and
-- how many were confirmed inside the business's "call within" time.

create or replace function public.response_times(p_workspace uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with waits as (
    select m.conversation_id, m.created_at as asked_at,
      (select r from messages r where r.conversation_id = m.conversation_id and r.direction = 'out' and r.created_at > m.created_at
         and coalesce(r.purpose, '') <> 'service' and not coalesce(r.imported, false) order by r.created_at limit 1) as reply
    from messages m
    where m.workspace_id = p_workspace and m.direction = 'in' and not coalesce(m.imported, false)
      and m.created_at::date between p_from and p_to
      -- only the first message of each customer turn
      and coalesce((select p.direction from messages p where p.conversation_id = m.conversation_id and p.created_at < m.created_at order by p.created_at desc limit 1), 'out') = 'out'
  ), answered as (
    select asked_at, (reply).created_at as replied_at, (reply).sent_by as who, (reply).by_ai as ai,
      extract(epoch from (reply).created_at - asked_at) / 60.0 as minutes
    from waits where (reply).id is not null
  ), by_person as (
    select who, count(*) n, percentile_cont(0.5) within group (order by minutes) med, avg(minutes) avg_m,
      count(*) filter (where minutes <= 5) within5
    from answered where who is not null group by who
  ), confirms as (
    select l.actor as who, extract(epoch from l.created_at - o.created_at) / 60.0 as minutes, o.id
    from orders o join activity_log l on l.entity = 'order' and l.entity_id = o.id and l.action = 'status:confirmed'
    where o.workspace_id = p_workspace and o.created_at::date between p_from and p_to and l.actor is not null
  ), confirm_by as (
    select who, count(*) n, percentile_cont(0.5) within group (order by minutes) med,
      count(*) filter (where minutes <= coalesce((select nullif(assignment ->> 'call_within_minutes', '')::numeric from workspaces where id = p_workspace), 120)) on_time
    from confirms group by who
  ), team as (
    select m.user_id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)) as name, m.role
    from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_workspace
  )
  select case when not private.is_member(p_workspace) then null else jsonb_build_object(
    'from', p_from, 'to', p_to,
    'callWithin', coalesce((select nullif(assignment ->> 'call_within_minutes', '')::int from workspaces where id = p_workspace), 120),
    'customerTurns', (select count(*) from waits),
    'unanswered', (select count(*) from waits where (reply).id is null),
    'overall', jsonb_build_object(
      'median', (select round(percentile_cont(0.5) within group (order by minutes)::numeric, 1) from answered),
      'within5', (select count(*) filter (where minutes <= 5) from answered),
      'answered', (select count(*) from answered)),
    'ai', jsonb_build_object(
      'replies', (select count(*) from answered where ai),
      'median', (select round(percentile_cont(0.5) within group (order by minutes)::numeric, 1) from answered where ai)),
    'automatic', (select count(*) from answered where who is null and not coalesce(ai, false)),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'userId', t.user_id, 'name', t.name, 'role', t.role,
        'replies', coalesce(b.n, 0), 'median', round(b.med::numeric, 1), 'average', round(b.avg_m::numeric, 1), 'within5', coalesce(b.within5, 0),
        'confirmed', coalesce(c.n, 0), 'confirmMedian', round(c.med::numeric, 1), 'confirmOnTime', coalesce(c.on_time, 0))
      order by coalesce(b.n, 0) + coalesce(c.n, 0) desc, t.name)
      from team t left join by_person b on b.who = t.user_id left join confirm_by c on c.who = t.user_id
      where b.n is not null or c.n is not null or t.role in ('sales', 'support')), '[]'::jsonb))
  end;
$$;
revoke execute on function public.response_times(uuid, date, date) from public, anon;
grant execute on function public.response_times(uuid, date, date) to authenticated;
create index if not exists messages_conv_created on public.messages (conversation_id, created_at);
