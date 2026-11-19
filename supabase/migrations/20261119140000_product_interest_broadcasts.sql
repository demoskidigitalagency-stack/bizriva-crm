-- Product interest and product broadcasts.
--
-- product_interest(): for each product, how many chats asked about it in the last 24 hours, 7 days
-- and 30 days, plus a day-by-day count (Segments page). A chat "asked about" a product when a
-- customer message names it (its name or one of its other names), or the customer carries the
-- "Asked about: <product>" tag and wrote in that window.
--
-- WhatsApp broadcasts can now go to "people who asked about <product> in the last N hours"
-- (campaigns.audience = {"product_id": …, "hours": 24}) with a typed message instead of a
-- template. Inside 24 hours of the customer's last message that's a normal reply; older chats on a
-- linked number get the text too, paced by the worker's daily marketing limit. Product audiences
-- skip people who said STOP / opted out, "Personal" and "Not a customer". The "everyone" audience
-- still needs marketing consent, as before. Broadcast messages are marked purpose = 'marketing'.

alter table public.campaigns drop constraint if exists campaigns_check;
alter table public.campaigns add constraint campaigns_check check (
  channel = 'email' and subject is not null and body is not null
  or channel = 'whatsapp' and (template_name is not null or nullif(btrim(body), '') is not null));

-- Contacts in a workspace who asked about a product within the last p_hours.
create or replace function private.product_askers(p_workspace uuid, p_product uuid, p_hours int)
returns table (contact_id uuid, conversation_id uuid, last_in timestamptz)
language sql stable security definer set search_path = public as $$
  with p as (
    select id, name, array(select lower(btrim(a)) from unnest(coalesce(aliases, '{}')) a where length(btrim(a)) >= 3) || lower(btrim(name)) as words
    from products where id = p_product and workspace_id = p_workspace
  ), since as (select now() - make_interval(hours => greatest(1, least(p_hours, 24 * 90))) as t)
  select c.contact_id, c.id, c.last_inbound_at
  from conversations c, p, since
  where c.workspace_id = p_workspace and c.last_inbound_at >= since.t
    and (
      exists (select 1 from contacts k where k.id = c.contact_id and ('Asked about: ' || left(p.name, 80)) = any(k.tags))
      or exists (select 1 from messages m where m.conversation_id = c.id and m.direction = 'in' and m.created_at >= since.t
                 and exists (select 1 from unnest(p.words) w where lower(m.body) like '%' || w || '%'))
    );
$$;
revoke execute on function private.product_askers(uuid, uuid, int) from public, anon, authenticated;

-- Segments page: interest per product (members of the workspace only).
create or replace function public.product_interest(p_workspace uuid, p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(7, least(coalesce(p_days, 14), 60)); out jsonb;
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by (x->>'d30')::int desc, x->>'name'), '[]') into out from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name,
      'h24', (select count(*) from private.product_askers(p_workspace, p.id, 24)),
      'd7', (select count(*) from private.product_askers(p_workspace, p.id, 24 * 7)),
      'd30', (select count(*) from private.product_askers(p_workspace, p.id, 24 * 30)),
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
grant execute on function public.product_interest(uuid, int) to authenticated;

-- Broadcast dialog: how many would get it (after the same skips as sending).
create or replace function public.product_audience_count(p_workspace uuid, p_product uuid, p_hours int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare total int; inwin int;
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select count(*), count(*) filter (where a.last_in > now() - interval '24 hours') into total, inwin
  from private.product_askers(p_workspace, p_product, p_hours) a join contacts k on k.id = a.contact_id
  where length(private.phone_key(k.phone)) >= 10
    and not (coalesce(k.tags, '{}') && array['Personal', 'Not a customer'])
    and (select s.granted from consents s where s.contact_id = k.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is not false;
  return jsonb_build_object('total', total, 'in_24h', inwin);
end $$;
grant execute on function public.product_audience_count(uuid, uuid, int) to authenticated;

create or replace function private.whatsapp_expand_broadcasts() returns int
language plpgsql security definer set search_path = public as $$
declare c campaigns; prev text; n int := 0; k record; conv uuid; inwin boolean; mid uuid; prod uuid; hrs int; linked boolean;
begin
  prev := private.sys_on();
  for c in select * from campaigns where channel = 'whatsapp' and status = 'scheduled' and coalesce(scheduled_for, now()) <= now() for update skip locked loop
    update campaigns set status = 'sending' where id = c.id;
    prod := nullif(c.audience->>'product_id', '')::uuid;
    hrs := coalesce(nullif(c.audience->>'hours', '')::int, 24);
    linked := exists (select 1 from wa_links l where l.workspace_id = c.workspace_id and l.status = 'connected');
    for k in
      select ct.id, coalesce(nullif(split_part(btrim(ct.name), ' ', 1), ''), 'there') as first
      from contacts ct
      where ct.workspace_id = c.workspace_id and length(private.phone_key(ct.phone)) >= 10
        and not exists (select 1 from campaign_recipients r where r.campaign_id = c.id and r.contact_id = ct.id)
        and case when prod is null
          then (select s.granted from consents s where s.contact_id = ct.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is true
          else ct.id in (select a.contact_id from private.product_askers(c.workspace_id, prod, hrs) a)
            and not (coalesce(ct.tags, '{}') && array['Personal', 'Not a customer'])
            and (select s.granted from consents s where s.contact_id = ct.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is not false
        end
      limit 5000
    loop
      conv := private.wa_conversation(c.workspace_id, k.id);
      select coalesce(last_inbound_at > now() - interval '24 hours', false) into inwin from conversations where id = conv;
      -- Outside 24 hours: the approved template (official API), or the typed text on a linked number.
      if not inwin and coalesce(c.template_name, '') = '' and not (linked and nullif(btrim(c.body), '') is not null) then
        insert into campaign_recipients(campaign_id, workspace_id, contact_id, skipped_reason) values (c.id, c.workspace_id, k.id, 'needs_template') on conflict do nothing;
        continue;
      end if;
      insert into messages(workspace_id, conversation_id, direction, body, status, template_name, purpose)
        values (c.workspace_id, conv, 'out', nullif(replace(coalesce(c.body, ''), '{{name}}', k.first), ''), 'queued',
                case when inwin or coalesce(c.template_name, '') = '' then null else c.template_name end, 'marketing')
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
