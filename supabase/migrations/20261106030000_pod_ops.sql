-- Bizriva CRM — pay-on-delivery operations (2026-11-06)
-- Agents and the call list, logistics partners with per-state fees and a
-- no-login delivery link, partner remittances, commission, order-based
-- follow-ups, re-order days, and WhatsApp/email campaigns with tracking.
-- Same rules as src/domain/ops.ts in the app.

-- ───────────────────────── settings ─────────────────────────
alter table public.workspaces
  add column assignment jsonb not null default '{"mode":"least_busy","call_within_minutes":120,"move_uncalled":true}',
  add column commission_per_order numeric(12,2) not null default 0 check (commission_per_order >= 0),
  add column partner_accept_minutes int not null default 60 check (partner_accept_minutes between 5 and 1440),
  add column email_settings jsonb not null default '{"provider":"none"}',
  add constraint workspaces_assignment_ok check (
    assignment ->> 'mode' in ('least_busy', 'round_robin', 'by_state')
    and (assignment ->> 'call_within_minutes')::int between 5 and 1440);

alter table public.workspace_members
  add column on_duty boolean not null default true,
  add column states text[] not null default '{}',
  add column monthly_target int not null default 0 check (monthly_target >= 0);

alter table public.products add column reorder_days int check (reorder_days is null or reorder_days between 1 and 730);

-- ───────────────────────── agents on orders ─────────────────────────
alter table public.orders
  add column assigned_to uuid references auth.users(id),
  add column assigned_at timestamptz,
  add column moved_from uuid[] not null default '{}',
  add column commission_paid_at timestamptz;
create index orders_assigned_open on public.orders (workspace_id, assigned_to) where status = 'pending_verification';

create table public.order_contact_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  by_user uuid references auth.users(id),
  via text not null check (via in ('call', 'whatsapp')),
  outcome text not null check (outcome in ('reached', 'no_answer', 'busy', 'wrong_number', 'call_back')),
  note text check (length(note) <= 500),
  at timestamptz not null default now()
);
create index on public.order_contact_attempts (order_id, at);
create index on public.order_contact_attempts (workspace_id, by_user, at);
alter table public.order_contact_attempts enable row level security;
create policy "members read attempts" on public.order_contact_attempts for select using (private.is_member(workspace_id));
create policy "members log attempts" on public.order_contact_attempts for insert with check (private.is_member(workspace_id));
-- Call records are evidence: no edits, no deletes.

-- Nigerian state from a city or area (unknown places stay as written).
create or replace function private.state_of(p text) returns text language sql immutable set search_path = '' as $$
  select case lower(trim(coalesce(p, '')))
    when '' then 'Unknown'
    when 'lagos' then 'Lagos' when 'ikeja' then 'Lagos' when 'lekki' then 'Lagos' when 'surulere' then 'Lagos' when 'yaba' then 'Lagos' when 'ajah' then 'Lagos' when 'ikorodu' then 'Lagos' when 'victoria island' then 'Lagos'
    when 'abuja' then 'FCT' when 'gwarinpa' then 'FCT' when 'wuse' then 'FCT' when 'fct' then 'FCT'
    when 'port harcourt' then 'Rivers' when 'ibadan' then 'Oyo' when 'benin city' then 'Edo' when 'benin' then 'Edo'
    when 'owerri' then 'Imo' when 'abeokuta' then 'Ogun' when 'ilorin' then 'Kwara' when 'jos' then 'Plateau' when 'calabar' then 'Cross River'
    when 'uyo' then 'Akwa Ibom' when 'asaba' then 'Delta' when 'warri' then 'Delta' when 'onitsha' then 'Anambra' when 'awka' then 'Anambra'
    when 'akure' then 'Ondo' when 'osogbo' then 'Osun' when 'ado ekiti' then 'Ekiti' when 'aba' then 'Abia' when 'umuahia' then 'Abia'
    else initcap(trim(p)) end;
$$;

-- Who gets this order: least busy, round robin or by state, among agents on duty.
create or replace function private.pick_agent(ws uuid, st text, exclude uuid[] default '{}') returns uuid
language plpgsql stable security definer set search_path = public as $$
declare mode text; last_id uuid; has_local boolean; pick uuid;
begin
  select coalesce(assignment ->> 'mode', 'least_busy'), nullif(assignment ->> 'last_assigned', '')::uuid into mode, last_id from workspaces where id = ws;
  select exists (select 1 from workspace_members x where x.workspace_id = ws and x.on_duty and x.role in ('sales', 'support', 'manager')
    and st = any(x.states) and not (x.user_id = any(exclude))) into has_local;
  with pool as (
    select m.user_id,
      (select count(*) from orders o where o.workspace_id = ws and o.assigned_to = m.user_id and o.status = 'pending_verification') as load,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.email, m.user_id::text) as nm
    from workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = ws and m.on_duty and m.role in ('sales', 'support', 'manager') and not (m.user_id = any(exclude))
      and (mode <> 'by_state' or not has_local or st = any(m.states))
  )
  select user_id into pick from pool
  order by
    case when mode = 'round_robin' then nm <= coalesce((select nm from pool where user_id = last_id), '') end, -- next after the last one, wrapping round
    case when mode = 'round_robin' then nm end,
    load, nm
  limit 1;
  return pick;
end $$;

-- Every new order goes to an agent straight away.
create or replace function private.assign_new_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only the server may pre-assign, and only to someone on the team.
  if new.assigned_to is not null and (not private.is_system() or not exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = new.assigned_to)) then
    new.assigned_to := null;
  end if;
  new.moved_from := '{}'; new.commission_paid_at := null;
  if new.assigned_to is null and new.status in ('pending_verification', 'confirmed') then
    new.assigned_to := private.pick_agent(new.workspace_id, private.state_of((select location from contacts where id = new.contact_id)));
    if new.assigned_to is not null then
      new.assigned_at := now();
      update workspaces set assignment = assignment || jsonb_build_object('last_assigned', new.assigned_to) where id = new.workspace_id;
    end if;
  end if;
  return new;
end $$;
create trigger b_assign_new_order before insert on public.orders for each row execute function private.assign_new_order();

-- Only owners/managers (or the server) reassign; only owners/finance mark commission paid.
create or replace function private.guard_order_ops() returns trigger
language plpgsql set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if new.assigned_to is distinct from old.assigned_to then
    if not private.has_role(new.workspace_id, array['owner','manager']::member_role[]) then raise exception 'Only owners and managers reassign orders' using errcode = '42501'; end if;
    if new.assigned_to is not null and not exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = new.assigned_to) then
      raise exception 'That person isn''t on this team' using errcode = '23503';
    end if;
    new.assigned_at := now();
  end if;
  if new.commission_paid_at is distinct from old.commission_paid_at then
    if not private.has_role(new.workspace_id, array['owner','finance']::member_role[]) then raise exception 'Only the owner or finance marks commission paid' using errcode = '42501'; end if;
    if new.commission_paid_at is not null and not (new.status = 'delivered' and new.amount_paid >= new.total) then
      raise exception 'Commission is earned only when the order is delivered and paid' using errcode = '23514';
    end if;
  end if;
  if new.moved_from is distinct from old.moved_from then raise exception 'Order history can''t be edited' using errcode = '42501'; end if;
  return new;
end $$;
create trigger guard_order_ops before update on public.orders for each row execute function private.guard_order_ops();

create or replace function private.stamp_attempt() returns trigger
language plpgsql set search_path = public as $$
begin
  if not private.is_system() then new.by_user := auth.uid(); new.at := now(); end if;
  return new;
end $$;
create trigger stamp_attempt before insert on public.order_contact_attempts for each row execute function private.stamp_attempt();
create trigger guard_same_ws before insert or update on public.order_contact_attempts for each row execute function private.guard_same_ws('order_id', 'orders');

-- Orders nobody called in twice the allowed time move to another agent on duty.
create or replace function private.move_uncalled() returns int
language plpgsql security definer set search_path = public as $$
declare r record; who uuid; n int := 0; prev text;
begin
  prev := private.sys_on();
  for r in
    select o.id, o.workspace_id, o.assigned_to, o.moved_from, c.location
    from orders o join workspaces w on w.id = o.workspace_id left join contacts c on c.id = o.contact_id
    where o.status = 'pending_verification' and o.assigned_to is not null
      and coalesce((w.assignment ->> 'move_uncalled')::boolean, true)
      and coalesce(o.assigned_at, o.created_at) < now() - make_interval(mins => 2 * (w.assignment ->> 'call_within_minutes')::int)
      and not exists (select 1 from order_contact_attempts a where a.order_id = o.id)
    for update of o skip locked
  loop
    who := private.pick_agent(r.workspace_id, private.state_of(r.location), r.moved_from || r.assigned_to);
    continue when who is null;
    update orders set assigned_to = who, assigned_at = now(), moved_from = moved_from || r.assigned_to where id = r.id;
    insert into activity_log(workspace_id, entity, entity_id, action, detail) values (r.workspace_id, 'order', r.id, 'moved_uncalled', jsonb_build_object('from', r.assigned_to, 'to', who));
    n := n + 1;
  end loop;
  perform private.sys_restore(prev);
  return n;
end $$;

-- Commission and leaderboard (reads as the signed-in person, so RLS applies).
create view public.agent_commission with (security_invoker = true) as
  select o.workspace_id, o.assigned_to as user_id,
    count(*) filter (where o.status in ('confirmed','processing','ready_for_dispatch','dispatched','in_transit','delivered') and o.created_at >= date_trunc('month', now())) as closed_this_month,
    count(*) filter (where o.status = 'delivered' and o.amount_paid >= o.total) as earned_orders,
    count(*) filter (where o.status = 'delivered' and o.amount_paid >= o.total and o.commission_paid_at is null) as unpaid_orders,
    max(w.commission_per_order) * count(*) filter (where o.status = 'delivered' and o.amount_paid >= o.total) as earned,
    max(w.commission_per_order) * count(*) filter (where o.status = 'delivered' and o.amount_paid >= o.total and o.commission_paid_at is null) as unpaid
  from orders o join workspaces w on w.id = o.workspace_id
  where o.assigned_to is not null
  group by o.workspace_id, o.assigned_to;

create or replace function public.pay_commission(p_workspace uuid, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int; prev text;
begin
  if not private.has_role(p_workspace, array['owner','finance']::member_role[]) then raise exception 'Only the owner or finance marks commission paid' using errcode = '42501'; end if;
  prev := private.sys_on();
  update orders set commission_paid_at = now()
    where workspace_id = p_workspace and assigned_to = p_user and status = 'delivered' and amount_paid >= total and commission_paid_at is null;
  get diagnostics n = row_count;
  insert into activity_log(workspace_id, actor, entity, action, detail) values (p_workspace, auth.uid(), 'commission', 'paid', jsonb_build_object('user', p_user, 'orders', n));
  perform private.sys_restore(prev);
  return n;
end $$;
revoke execute on function public.pay_commission(uuid, uuid) from public, anon;
grant execute on function public.pay_commission(uuid, uuid) to authenticated;

-- ───────────────────────── logistics partners ─────────────────────────
create table public.logistics_partners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 10 and 15),
  kind text not null default 'rider' check (kind in ('rider', 'partner')),
  zone text,
  states text[] not null default '{}',
  fees jsonb not null default '{}' check (jsonb_typeof(fees) = 'object'),
  failed_fee numeric(12,2) not null default 0 check (failed_fee >= 0),
  whatsapp_group text check (whatsapp_group is null or whatsapp_group ~ '^https://chat\.whatsapp\.com/'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.logistics_partners (workspace_id);
alter table public.logistics_partners enable row level security;
create policy "members see partners" on public.logistics_partners for select using (private.is_member(workspace_id));
create policy "owners, managers and dispatch manage partners" on public.logistics_partners for all
  using (private.has_role(workspace_id, array['owner','manager','dispatcher']::member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager','dispatcher']::member_role[]));

alter table public.deliveries
  add column partner_id uuid references public.logistics_partners(id),
  add column link_token_hash text unique,
  add column sent_at timestamptz,
  add column accepted_at timestamptz,
  add column fee numeric(12,2) check (fee is null or fee >= 0),
  add column attempts int not null default 0 check (attempts >= 0),
  add column failure_reason text check (length(failure_reason) <= 200);
create index on public.deliveries (partner_id);
drop trigger if exists guard_same_ws on public.deliveries;
create trigger guard_same_ws before insert or update on public.deliveries for each row execute function private.guard_same_ws('order_id', 'orders', 'partner_id', 'logistics_partners');

create table public.partner_remittances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  partner_id uuid not null references public.logistics_partners(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  proof_url text,
  note text check (length(note) <= 500),
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected')),
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz
);
create index on public.partner_remittances (workspace_id, partner_id);
alter table public.partner_remittances enable row level security;
create policy "members see remittances" on public.partner_remittances for select using (private.is_member(workspace_id));
create policy "money roles record remittances" on public.partner_remittances for insert with check (private.has_role(workspace_id, array['owner','manager','finance']::member_role[]));
create policy "money roles confirm remittances" on public.partner_remittances for update
  using (private.has_role(workspace_id, array['owner','finance']::member_role[])) with check (private.has_role(workspace_id, array['owner','finance']::member_role[]));
create trigger guard_same_ws before insert or update on public.partner_remittances for each row execute function private.guard_same_ws('partner_id', 'logistics_partners');
create or replace function private.guard_remittance() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.amount, new.partner_id) is distinct from (old.amount, old.partner_id) then raise exception 'Record a new remittance instead of editing one' using errcode = '42501'; end if;
    if new.status <> old.status then new.confirmed_by := auth.uid(); new.confirmed_at := now(); end if;
  end if;
  return new;
end $$;
create trigger guard_remittance before update on public.partner_remittances for each row execute function private.guard_remittance();

-- What each partner owes: cash collected − their fees − failed charges − confirmed remittances.
create view public.partner_statements with (security_invoker = true) as
  select p.workspace_id, p.id as partner_id, p.name,
    count(d.*) filter (where d.outcome = 'delivered') as delivered,
    coalesce(sum(d.attempts) filter (where d.outcome in ('failed', 'returned', 'refused')), 0) as failed,
    coalesce(sum(d.cash_collected) filter (where d.outcome = 'delivered'), 0) as cash_collected,
    coalesce(sum(d.fee) filter (where d.outcome = 'delivered'), 0) as fees,
    coalesce(sum(d.attempts) filter (where d.outcome in ('failed', 'returned', 'refused')), 0) * p.failed_fee as failed_charges,
    coalesce((select sum(r.amount) from partner_remittances r where r.partner_id = p.id and r.status = 'confirmed'), 0) as remitted
  from logistics_partners p left join deliveries d on d.partner_id = p.id
  group by p.id;

-- Send a delivery to a rider/partner: returns the private token once (only its hash is kept).
create or replace function public.send_to_partner(p_delivery uuid, p_partner uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d deliveries; o orders; p logistics_partners; st text; tok text; prev text;
begin
  select * into d from deliveries where id = p_delivery;
  if d.id is null or not private.has_role(d.workspace_id, array['owner','manager','dispatcher']::member_role[]) then raise exception 'Delivery not found' using errcode = '42501'; end if;
  select * into o from orders where id = d.order_id;
  if o.status not in ('confirmed', 'processing', 'ready_for_dispatch', 'dispatched', 'in_transit') then raise exception 'Order % isn''t confirmed yet — confirm it before sending to logistics', o.ref; end if;
  st := private.state_of((select location from contacts where id = o.contact_id));
  if p_partner is null then
    select * into p from logistics_partners where workspace_id = d.workspace_id and active and st = any(states) order by coalesce((fees ->> st)::numeric, 0) limit 1;
  else
    select * into p from logistics_partners where id = p_partner and workspace_id = d.workspace_id and active;
  end if;
  if p.id is null then raise exception 'No active rider or partner covers %', st; end if;
  tok := encode(extensions.gen_random_bytes(18), 'hex');
  prev := private.sys_on();
  update deliveries set partner_id = p.id, fee = coalesce((p.fees ->> st)::numeric, 0), link_token_hash = encode(extensions.digest(tok, 'sha256'), 'hex'),
    sent_at = now(), accepted_at = null where id = d.id;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail) values (d.workspace_id, auth.uid(), 'delivery', d.id, 'sent_to_partner', jsonb_build_object('partner', p.name, 'state', st));
  perform private.sys_restore(prev);
  return jsonb_build_object('token', tok, 'partner', p.name, 'phone', p.phone, 'group', p.whatsapp_group, 'fee', coalesce((p.fees ->> st)::numeric, 0), 'state', st);
end $$;
revoke execute on function public.send_to_partner(uuid, uuid) from public, anon;
grant execute on function public.send_to_partner(uuid, uuid) to authenticated;

-- The private link (via the delivery-link Edge Function; service role only).
create or replace function public.svc_delivery_view(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('business', w.name, 'currency', w.currency, 'ref', o.ref, 'customer', coalesce(c.name, 'Customer'), 'phone', c.phone,
    'address', concat_ws(', ', nullif(o.delivery_address, ''), c.location, nullif('near ' || coalesce(o.landmark, c.landmark), 'near ')),
    'items', coalesce((select jsonb_agg(p.name || case when i.quantity > 1 then ' × ' || i.quantity else '' end) from order_items i join products p on p.id = i.product_id where i.order_id = o.id), '[]'),
    'collect', greatest(o.total - o.amount_paid, 0), 'status', coalesce(d.outcome, o.status::text), 'accepted', d.accepted_at is not null, 'partner', lp.name)
  from deliveries d join orders o on o.id = d.order_id join workspaces w on w.id = d.workspace_id
    left join contacts c on c.id = o.contact_id left join logistics_partners lp on lp.id = d.partner_id
  where d.link_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and d.sent_at > now() - interval '30 days';
$$;

create or replace function public.svc_delivery_action(p_token text, p_action text, p_cash numeric default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d deliveries; o orders; prev text;
begin
  select * into d from deliveries where link_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and sent_at > now() - interval '30 days' for update;
  if d.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if d.outcome in ('delivered', 'returned') then return jsonb_build_object('status', 'closed'); end if;
  select * into o from orders where id = d.order_id for update;
  prev := private.sys_on();
  update deliveries set accepted_at = coalesce(accepted_at, now()) where id = d.id;
  if p_action = 'accept' then
    if o.status in ('confirmed', 'processing', 'ready_for_dispatch') then
      if o.status <> 'ready_for_dispatch' then update orders set status = 'ready_for_dispatch' where id = o.id; end if;
      update orders set status = 'dispatched' where id = o.id;
    end if;
  elsif p_action = 'delivered' then
    if p_cash is not null and (p_cash < 0 or p_cash > o.total) then perform private.sys_restore(prev); return jsonb_build_object('status', 'invalid', 'reason', 'Cash must be between 0 and the order total'); end if;
    if o.status in ('confirmed', 'processing') then update orders set status = 'ready_for_dispatch' where id = o.id; end if;
    update orders set status = 'delivered' where id = o.id and status <> 'delivered';
    update deliveries set cash_collected = coalesce(p_cash, cash_collected) where id = d.id;
  elsif p_action = 'failed' then
    update deliveries set outcome = 'failed', attempts = attempts + 1, failure_reason = left(coalesce(nullif(p_reason, ''), 'Customer unreachable'), 200) where id = d.id;
  else
    perform private.sys_restore(prev); return jsonb_build_object('status', 'invalid', 'reason', 'Unknown action');
  end if;
  insert into activity_log(workspace_id, entity, entity_id, action, detail) values (d.workspace_id, 'delivery', d.id, 'partner_' || p_action, jsonb_build_object('cash', p_cash, 'reason', p_reason));
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'ok');
end $$;

-- ───────────────────────── follow-ups and campaigns ─────────────────────────
alter table public.followup_rules
  add column trigger text not null default 'no_reply_after_details'
    check (trigger in ('no_reply_after_details', 'no_reply_after_price', 'checkout_abandoned', 'delivery_concern', 'delivery_failed', 'unreachable', 'order_cancelled', 'reorder_due'));

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  channel text not null check (channel in ('whatsapp', 'email')),
  audience jsonb not null default '{}',
  template_name text,
  subject text check (length(subject) <= 200),
  body text check (length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (channel = 'email' and subject is not null and body is not null or channel = 'whatsapp' and template_name is not null)
);
create index on public.campaigns (workspace_id, status);
create table public.campaign_recipients (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tracking_id uuid not null default gen_random_uuid() unique,
  delivered_at timestamptz, opened_at timestamptz, clicked_at timestamptz, unsubscribed_at timestamptz,
  order_id uuid references public.orders(id),
  primary key (campaign_id, contact_id)
);
create index on public.campaign_recipients (workspace_id, contact_id);
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
create policy "members see campaigns" on public.campaigns for select using (private.is_member(workspace_id));
create policy "owners and managers run campaigns" on public.campaigns for all
  using (private.has_role(workspace_id, array['owner','manager']::member_role[])) with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create policy "members see campaign results" on public.campaign_recipients for select using (private.is_member(workspace_id));
-- Recipients and their opens/clicks are written by the server only (sending and the email service's notifications).
create trigger guard_same_ws before insert or update on public.campaign_recipients for each row execute function private.guard_same_ws('campaign_id', 'campaigns', 'contact_id', 'contacts', 'order_id', 'orders');

-- Results per campaign.
create view public.campaign_results with (security_invoker = true) as
  select c.id as campaign_id, c.workspace_id, c.name, c.channel, c.sent_at,
    count(r.*) as recipients, count(r.delivered_at) as delivered, count(r.opened_at) as opened, count(r.clicked_at) as clicked, count(r.order_id) as orders,
    coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as delivered_revenue
  from campaigns c left join campaign_recipients r on r.campaign_id = c.id left join orders o on o.id = r.order_id
  group by c.id;

create or replace function private.stamp_campaign_actor() returns trigger language plpgsql set search_path = public as $$
begin if not private.is_system() then new.created_by := auth.uid(); end if; return new; end $$;
create trigger stamp_campaign_actor before insert on public.campaigns for each row execute function private.stamp_campaign_actor();

-- Email service key goes to Vault, like payment keys.
alter table public.workspaces add column email_key_secret_id uuid;
create or replace function public.save_email_key(p_workspace uuid, p_provider text, p_from text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect an email service' using errcode = '42501'; end if;
  if p_provider not in ('brevo', 'mailgun', 'ses', 'smtp') then raise exception 'Unknown email service'; end if;
  if coalesce(p_from, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the address to send from'; end if;
  if length(coalesce(p_secret, '')) < 16 then raise exception 'That doesn''t look like an API key'; end if;
  select email_key_secret_id into sid from workspaces where id = p_workspace;
  if sid is null then sid := vault.create_secret(p_secret, 'email_' || p_workspace::text || '_' || extract(epoch from now())::bigint, 'Email key for workspace ' || p_workspace);
  else perform vault.update_secret(sid, p_secret); end if;
  update workspaces set email_key_secret_id = sid, email_settings = jsonb_build_object('provider', p_provider, 'from', lower(p_from)) where id = p_workspace;
end $$;
revoke execute on function public.save_email_key(uuid, text, text, text) from public, anon;
grant execute on function public.save_email_key(uuid, text, text, text) to authenticated;

-- ───────────────────────── grants and schedule ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array['svc_delivery_view(text)', 'svc_delivery_action(text, text, numeric, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- Index every new foreign key.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, string_agg(quote_ident(a.attname), ', ' order by k.ord) as cols
    from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey)
    group by c.conrelid, c.conname
  loop
    execute format('create index if not exists %I on %s (%s)', left(r.conname, 59) || '_idx', r.tbl, r.cols);
  end loop;
end $$;

-- Move uncalled orders every 5 minutes.
create extension if not exists pg_cron;
select cron.schedule('bizriva-move-uncalled', '*/5 * * * *', 'select private.move_uncalled()');
