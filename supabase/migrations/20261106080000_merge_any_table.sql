-- Merge works for tables keyed without an id column (campaign_recipients).
create or replace function public.merge_contacts(p_workspace uuid, p_keep uuid, p_merge uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; t text; r record; prev text; n int;
begin
  if not private.has_role(p_workspace, array['owner','manager']::member_role[]) then
    raise exception 'Only an owner or a manager can merge customers' using errcode = '42501';
  end if;
  if not exists (select 1 from contacts where id = p_keep and workspace_id = p_workspace) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select array_agg(id) into ids from contacts where workspace_id = p_workspace and id = any(p_merge) and id <> p_keep;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return 0; end if;
  prev := private.sys_on();
  -- Customer totals add up.
  insert into customers(workspace_id, contact_id, first_order_at, lifetime_value, refused_deliveries)
    select p_workspace, p_keep, min(first_order_at), coalesce(sum(lifetime_value), 0), coalesce(sum(refused_deliveries), 0) from customers where contact_id = any(ids || p_keep)
    having count(*) > 0
    on conflict (contact_id) do update set first_order_at = excluded.first_order_at, lifetime_value = excluded.lifetime_value, refused_deliveries = excluded.refused_deliveries;
  delete from customers where contact_id = any(ids);
  -- Everything else moves; a row that would duplicate one the kept customer already has is dropped.
  foreach t in array array['contact_identities','leads','conversations','orders','consents','payments','order_form_submissions','complaints',
    'calendar_events','contact_facts','connection_events','customer_accounts','payment_requests','payment_events','campaign_recipients','tasks'] loop
    for r in execute format('select ctid as rid from public.%I where contact_id = any($1)', t) using ids loop
      begin
        execute format('update public.%I set contact_id = $1 where ctid = $2', t) using p_keep, r.rid;
      exception when unique_violation then
        execute format('delete from public.%I where ctid = $1', t) using r.rid;
      end;
    end loop;
  end loop;
  update contacts k set tags = (select coalesce(array_agg(distinct x), '{}') from contacts c, unnest(c.tags) x where c.id = any(ids || p_keep)),
    phone = coalesce(k.phone, (select phone from contacts where id = any(ids) and phone is not null limit 1)),
    email = coalesce(k.email, (select email from contacts where id = any(ids) and email is not null limit 1)),
    address = coalesce(k.address, (select address from contacts where id = any(ids) and address is not null limit 1)),
    updated_at = now()
  where k.id = p_keep;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    select p_workspace, auth.uid(), 'contact', p_keep, 'merged', jsonb_build_object('count', n, 'names', jsonb_agg(coalesce(name, phone))) from contacts where id = any(ids);
  delete from contacts where id = any(ids);
  perform private.sys_restore(prev);
  return n;
end $$;
