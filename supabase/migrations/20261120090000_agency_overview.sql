-- Agency view: every business the signed-in person belongs to, with today's numbers, so one person
-- (or an agency) can run several businesses — e.g. one per WhatsApp number or country — from one screen.
create or replace function public.agency_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'name', w.name, 'currency', w.currency, 'role', m.role,
    'whatsapp', (select l.status from wa_links l where l.workspace_id = w.id),
    'whatsappNumber', (select l.phone from wa_links l where l.workspace_id = w.id),
    'ordersToday', (select count(*) from orders o where o.workspace_id = w.id and (o.created_at at time zone coalesce(w.timezone, 'Africa/Lagos'))::date = (now() at time zone coalesce(w.timezone, 'Africa/Lagos'))::date),
    'toConfirm', (select count(*) from orders o where o.workspace_id = w.id and o.status = 'pending_verification'),
    'waiting', (select count(*) from contacts k where k.workspace_id = w.id and 'Waiting on our reply' = any(k.tags)),
    'chatsToday', (select count(distinct c.id) from conversations c join messages mm on mm.conversation_id = c.id where c.workspace_id = w.id and mm.direction = 'in' and mm.created_at > now() - interval '24 hours'),
    'deliveredMonth', (select coalesce(sum(o.total), 0) from orders o where o.workspace_id = w.id and o.status = 'delivered' and o.currency is null and o.created_at >= date_trunc('month', now())),
    'customers', (select count(*) from contacts k where k.workspace_id = w.id)
  ) order by w.name), '[]')
  from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = auth.uid();
$$;
grant execute on function public.agency_overview() to authenticated;
