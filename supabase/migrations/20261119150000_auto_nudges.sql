-- Broadcast audiences up to a year, "everyone who messaged us", saved messages, automatic nudges
-- and an automatic answer when someone replies to a broadcast.
--
-- campaigns.audience:
--   {"kind":"product","product_id":…,"hours":N}  people who asked about the product in the last N hours
--   {"kind":"messaged","hours":N}                 everyone who wrote to us in the last N hours
--   {} (or no kind)                               everyone with marketing consent (as before)
-- N is capped at one year. Product/messaged audiences skip opted-out, "Personal" and "Not a customer".
--
-- Automatic nudges: a campaign with status 'auto' runs every 10 minutes and messages each new person
-- in its audience once, after they've been quiet for audience.wait_hours (default 2), skipping anyone
-- who ordered in the last 7 days. 'paused' stops it.
--
-- Replies: when a customer writes back within 3 days of a broadcast message, the recipient row is
-- marked replied, the customer is tagged "Replied to broadcast", and the campaign's reply_body (if
-- any) is sent once.

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check check (status in ('draft', 'scheduled', 'sending', 'sent', 'auto', 'paused'));
alter table public.campaigns add column if not exists reply_body text check (length(reply_body) <= 2000);
alter table public.campaign_recipients add column if not exists replied_at timestamptz;

create table if not exists public.saved_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.saved_messages enable row level security;
create policy "members use saved messages" on public.saved_messages for all
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
grant select, insert, update, delete on public.saved_messages to authenticated;

-- Product askers: window up to a year. "Last message" comes from the messages themselves, because
-- chats loaded from the phone's history have no conversations.last_inbound_at.
create or replace function private.product_askers(p_workspace uuid, p_product uuid, p_hours int)
returns table (contact_id uuid, conversation_id uuid, last_in timestamptz)
language sql stable security definer set search_path = public as $$
  with p as (
    select id, name, array(select lower(btrim(a)) from unnest(coalesce(aliases, '{}')) a where length(btrim(a)) >= 3) || lower(btrim(name)) as words
    from products where id = p_product and workspace_id = p_workspace
  ), since as (select now() - make_interval(hours => greatest(1, least(p_hours, 24 * 366))) as t),
  li as (select m.conversation_id, max(m.created_at) as last_in from messages m, since
         where m.workspace_id = p_workspace and m.direction = 'in' and m.created_at >= since.t group by 1)
  select c.contact_id, c.id, greatest(li.last_in, c.last_inbound_at)
  from conversations c join li on li.conversation_id = c.id, p, since
  where c.workspace_id = p_workspace
    and (
      exists (select 1 from contacts k where k.id = c.contact_id and ('Asked about: ' || left(p.name, 80)) = any(k.tags))
      or exists (select 1 from messages m where m.conversation_id = c.id and m.direction = 'in' and m.created_at >= since.t
                 and exists (select 1 from unnest(p.words) w where lower(m.body) like '%' || w || '%'))
    );
$$;

-- Who a campaign's audience is (before the per-campaign "already sent" check).
create or replace function private.audience_contacts(p_workspace uuid, p_audience jsonb)
returns table (contact_id uuid, last_in timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare kind text := coalesce(p_audience->>'kind', case when p_audience ? 'product_id' then 'product' else 'consent' end);
  hrs int := greatest(1, least(coalesce(nullif(p_audience->>'hours', '')::int, 24), 24 * 366));
begin
  if kind = 'product' then
    return query select distinct on (a.contact_id) a.contact_id, a.last_in
      from private.product_askers(p_workspace, nullif(p_audience->>'product_id', '')::uuid, hrs) a order by a.contact_id, a.last_in desc;
  elsif kind = 'messaged' then
    return query select c.contact_id, max(greatest(m.created_at, c.last_inbound_at)) from conversations c join messages m on m.conversation_id = c.id
      where c.workspace_id = p_workspace and m.direction = 'in' and m.created_at >= now() - make_interval(hours => hrs) group by c.contact_id;
  else
    return query select k.id, (select max(m.created_at) from conversations c join messages m on m.conversation_id = c.id and m.direction = 'in' where c.contact_id = k.id)
      from contacts k where k.workspace_id = p_workspace
        and (select s.granted from consents s where s.contact_id = k.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is true;
    return;
  end if;
end $$;
revoke execute on function private.audience_contacts(uuid, jsonb) from public, anon, authenticated;

-- Segments page: interest per product, now with a one-year count.
create or replace function public.product_interest(p_workspace uuid, p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(7, least(coalesce(p_days, 14), 60)); out jsonb;
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by (x->>'y1')::int desc, x->>'name'), '[]') into out from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name,
      'h24', (select count(*) from private.product_askers(p_workspace, p.id, 24)),
      'd7', (select count(*) from private.product_askers(p_workspace, p.id, 24 * 7)),
      'd30', (select count(*) from private.product_askers(p_workspace, p.id, 24 * 30)),
      'y1', (select count(*) from private.product_askers(p_workspace, p.id, 24 * 366)),
      'days', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'chats', coalesce(t.n, 0)) order by g.day), '[]')
               from generate_series((current_date - (d - 1)), current_date, interval '1 day') g(day)
               left join (
                 select m.created_at::date as day, count(distinct m.conversation_id) as n
                 from messages m
                 where m.workspace_id = p_workspace and m.direction = 'in' and m.created_at >= current_date - (d - 1)
                   and exists (select 1 from unnest(array(select lower(btrim(a)) from unnest(coalesce(p.aliases, '{}')) a where length(btrim(a)) >= 3) || lower(btrim(p.name))) w
                               where lower(m.body) like '%' || w || '%')
                 group by 1) t on t.day = g.day::date)
    ) x
    from products p where p.workspace_id = p_workspace and coalesce(p.active, true)
  ) s;
  return out;
end $$;

-- Contacts a campaign may message now (skips applied).
create or replace function private.campaign_targets(c campaigns)
returns table (contact_id uuid, last_in timestamptz, first text)
language sql stable security definer set search_path = public as $$
  select a.contact_id, a.last_in, coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there')
  from private.audience_contacts(c.workspace_id, c.audience) a join contacts k on k.id = a.contact_id
  where length(private.phone_key(k.phone)) >= 10
    and not exists (select 1 from campaign_recipients r where r.campaign_id = c.id and r.contact_id = k.id)
    and (coalesce(c.audience->>'kind', case when c.audience ? 'product_id' then 'product' else 'consent' end) = 'consent'
         or (not (coalesce(k.tags, '{}') && array['Personal', 'Not a customer'])
             and (select s.granted from consents s where s.contact_id = k.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is not false))
    and (c.status <> 'auto' or (
          a.last_in <= now() - make_interval(hours => greatest(0, least(coalesce(nullif(c.audience->>'wait_hours', '')::int, 2), 72)))
          and not exists (select 1 from orders o where o.contact_id = k.id and o.created_at > now() - interval '7 days')))
  limit 5000;
$$;
revoke execute on function private.campaign_targets(campaigns) from public, anon, authenticated;

-- Queue one campaign's messages (scheduled ones once; automatic ones on every run).
create or replace function private.campaign_send(c campaigns) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k record; conv uuid; inwin boolean; mid uuid;
  linked boolean := exists (select 1 from wa_links l where l.workspace_id = c.workspace_id and l.status = 'connected');
begin
  for k in select * from private.campaign_targets(c) loop
    conv := private.wa_conversation(c.workspace_id, k.contact_id);
    select coalesce(last_inbound_at > now() - interval '24 hours', false) into inwin from conversations where id = conv;
    if not inwin and coalesce(c.template_name, '') = '' and not (linked and nullif(btrim(c.body), '') is not null) then
      insert into campaign_recipients(campaign_id, workspace_id, contact_id, skipped_reason) values (c.id, c.workspace_id, k.contact_id, 'needs_template') on conflict do nothing;
      continue;
    end if;
    insert into messages(workspace_id, conversation_id, direction, body, status, template_name, purpose)
      values (c.workspace_id, conv, 'out', nullif(replace(coalesce(c.body, ''), '{{name}}', k.first), ''), 'queued',
              case when inwin or coalesce(c.template_name, '') = '' then null else c.template_name end, 'marketing')
      returning id into mid;
    insert into campaign_recipients(campaign_id, workspace_id, contact_id, message_id) values (c.id, c.workspace_id, k.contact_id, mid) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.campaign_send(campaigns) from public, anon, authenticated;

create or replace function private.whatsapp_expand_broadcasts() returns int
language plpgsql security definer set search_path = public as $$
declare c campaigns; prev text; n int := 0;
begin
  prev := private.sys_on();
  for c in select * from campaigns where channel = 'whatsapp' and status = 'scheduled' and coalesce(scheduled_for, now()) <= now() for update skip locked loop
    update campaigns set status = 'sending' where id = c.id;
    n := n + private.campaign_send(c);
    update campaigns set status = 'sent', sent_at = now() where id = c.id;
  end loop;
  perform private.sys_restore(prev);
  return n;
end $$;
revoke execute on function private.whatsapp_expand_broadcasts() from public, anon, authenticated;

create or replace function private.run_auto_nudges() returns int
language plpgsql security definer set search_path = public as $$
declare c campaigns; prev text; n int := 0; m int;
begin
  prev := private.sys_on();
  for c in select * from campaigns where channel = 'whatsapp' and status = 'auto' and coalesce(scheduled_for, now()) <= now() for update skip locked loop
    m := private.campaign_send(c);
    if m > 0 then update campaigns set sent_at = now() where id = c.id; end if;
    n := n + m;
  end loop;
  perform private.sys_restore(prev);
  return n;
end $$;
revoke execute on function private.run_auto_nudges() from public, anon, authenticated;

select cron.schedule('bizriva-auto-nudges', '*/10 * * * *', $job$
  select private.run_auto_nudges() where exists (select 1 from public.campaigns where status = 'auto')
$job$);

-- A customer answers a broadcast: mark it, tag them, send the campaign's answer once.
create or replace function private.broadcast_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; prev text; contact uuid;
begin
  if new.direction <> 'in' or coalesce(new.imported, false) then return null; end if;
  select contact_id into contact from conversations where id = new.conversation_id;
  select cr.campaign_id, cr.contact_id, c.reply_body, c.workspace_id into r
    from campaign_recipients cr join messages m on m.id = cr.message_id join campaigns c on c.id = cr.campaign_id
    where cr.contact_id = contact and cr.replied_at is null and m.conversation_id = new.conversation_id
      and m.status in ('sent', 'delivered', 'read') and m.created_at < new.created_at and m.created_at > new.created_at - interval '3 days'
    order by m.created_at desc limit 1;
  if r.campaign_id is null then return null; end if;
  prev := private.sys_on();
  update campaign_recipients set replied_at = now() where campaign_id = r.campaign_id and contact_id = r.contact_id;
  update contacts set tags = array(select distinct unnest(coalesce(tags, '{}') || array['Replied to broadcast'])) where id = r.contact_id;
  if nullif(btrim(r.reply_body), '') is not null then
    insert into messages(workspace_id, conversation_id, direction, body, status, purpose)
      values (r.workspace_id, new.conversation_id, 'out',
              replace(r.reply_body, '{{name}}', coalesce((select nullif(split_part(btrim(name), ' ', 1), '') from contacts where id = r.contact_id), 'there')), 'queued', 'service');
  end if;
  perform private.sys_restore(prev);
  return null;
end $$;
drop trigger if exists broadcast_reply on public.messages;
create trigger broadcast_reply after insert on public.messages for each row when (new.direction = 'in') execute function private.broadcast_reply();

-- Broadcast dialog count for any audience.
create or replace function public.audience_count(p_workspace uuid, p_audience jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare total int; inwin int; c campaigns;
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  c.id := gen_random_uuid(); c.workspace_id := p_workspace; c.audience := coalesce(p_audience, '{}'); c.status := 'draft';
  select count(*), count(*) filter (where t.last_in > now() - interval '24 hours') into total, inwin from private.campaign_targets(c) t;
  return jsonb_build_object('total', total, 'in_24h', inwin);
end $$;
grant execute on function public.audience_count(uuid, jsonb) to authenticated;

create or replace view public.campaign_results with (security_invoker = true) as
  select c.id as campaign_id, c.workspace_id, c.name, c.channel, c.sent_at, count(r.*) as recipients,
    count(r.delivered_at) as delivered, count(r.opened_at) as opened, count(r.clicked_at) as clicked, count(r.order_id) as orders,
    coalesce(sum(o.total) filter (where o.status = 'delivered'::order_status), 0::numeric) as delivered_revenue,
    count(r.replied_at) as replied
  from campaigns c left join campaign_recipients r on r.campaign_id = c.id left join orders o on o.id = r.order_id
  group by c.id;
