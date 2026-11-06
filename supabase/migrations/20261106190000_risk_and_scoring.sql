-- Bizriva CRM — COD risk flags, lead scoring and pipeline stages on the server (2026-11-06).
--
-- Risk (same factors as the app's COD check, never "suspicious just for being new"):
--   earlier failed/refused/returned deliveries +35 each · another unconfirmed order +25 ·
--   phone looks incomplete +30 · no delivery address +20 · unpaid balance on an earlier order +15 ·
--   order above settings.riskHighValue (default ₦150,000) +10 · first order, only alongside another reason +5.
--   Level: high ≥ 50, medium ≥ 20. A HIGH-risk cash-on-delivery order can only be confirmed by an
--   owner or manager (sales agents escalate it).
-- Lead score (0–100) from real buying actions; pipeline stages move forward on their own.

alter table public.orders
  add column risk_score int not null default 0,
  add column risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  add column risk_reasons text[] not null default '{}';

create or replace function private.order_risk(o public.orders) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k contacts; s int := 0; why text[] := '{}'; n int; hv numeric;
begin
  select * into k from contacts where id = o.contact_id;
  select count(*) into n from deliveries d join orders o2 on o2.id = d.order_id
    where o2.contact_id = o.contact_id and o2.id <> o.id and d.outcome in ('refused', 'returned', 'unreachable');
  if n > 0 then s := s + 35 * n; why := array_append(why, n || ' earlier deliver' || case when n = 1 then 'y' else 'ies' end || ' failed or returned'); end if;
  if exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.id <> o.id and o2.status = 'pending_verification') then
    s := s + 25; why := array_append(why, 'Another unconfirmed order from the same customer'); end if;
  if length(private.phone_key(k.phone)) < 10 then s := s + 30; why := array_append(why, 'Phone number looks incomplete'); end if;
  if coalesce(btrim(coalesce(o.delivery_address, k.address)), '') = '' then s := s + 20; why := array_append(why, 'No delivery address'); end if;
  if exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.id <> o.id and o2.status = 'delivered' and coalesce(o2.amount_paid, 0) < o2.total) then
    s := s + 15; why := array_append(why, 'Unpaid balance on an earlier order'); end if;
  select coalesce(nullif(settings ->> 'riskHighValue', '')::numeric, 150000) into hv from workspaces where id = o.workspace_id;
  if o.total > hv then s := s + 10; why := array_append(why, 'High order value for cash on delivery'); end if;
  if cardinality(why) > 0 and not exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.id <> o.id and o2.status = 'delivered') then
    s := s + 5; why := array_append(why, 'First order'); end if;
  return jsonb_build_object('score', s, 'level', case when s >= 50 then 'high' when s >= 20 then 'medium' else 'low' end, 'reasons', to_jsonb(why));
end $$;

create or replace function private.set_order_risk() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := private.order_risk(new);
  new.risk_score := (r ->> 'score')::int;
  new.risk_level := r ->> 'level';
  new.risk_reasons := array(select jsonb_array_elements_text(r -> 'reasons'));
  return new;
end $$;
-- Named to run first (after numbering), and on every change, so nobody can edit the risk by hand.
create trigger a_set_order_risk before insert or update on public.orders for each row execute function private.set_order_risk();
grant execute on function private.set_order_risk() to authenticated, service_role;

-- A HIGH-risk COD order needs an owner or manager to confirm it.
create or replace function private.guard_high_risk() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if old.status = 'pending_verification' and new.status in ('confirmed', 'processing', 'ready_for_dispatch') and new.payment_method = 'cod'
     and new.risk_level = 'high' and not private.has_role(new.workspace_id, array['owner','manager']::member_role[]) then
    raise exception 'High-risk order (%): an owner or manager must confirm it', array_to_string(new.risk_reasons, '; ') using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_high_risk before update of status on public.orders for each row execute function private.guard_high_risk();
grant execute on function private.guard_high_risk() to authenticated, service_role;

-- When a delivery fails or a balance changes, the customer's other open orders are re-checked.
create or replace function private.refresh_contact_risk(contact uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; r jsonb; prev text;
begin
  prev := private.sys_on();
  for o in select * from orders where contact_id = contact and status in ('pending_verification', 'confirmed', 'processing', 'ready_for_dispatch') loop
    r := private.order_risk(o);
    update orders set risk_score = (r ->> 'score')::int, risk_level = r ->> 'level', risk_reasons = array(select jsonb_array_elements_text(r -> 'reasons')) where id = o.id;
  end loop;
  perform private.sys_restore(prev);
end $$;
create or replace function private.delivery_risk() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.outcome is distinct from old.outcome then perform private.refresh_contact_risk((select contact_id from orders where id = new.order_id)); end if;
  return null;
end $$;
create trigger delivery_risk after update of outcome on public.deliveries for each row execute function private.delivery_risk();
grant execute on function private.delivery_risk() to authenticated, service_role;

-- ───────────── lead score and stage ─────────────
create or replace function private.touch_lead(ws uuid, contact uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l leads; ins int; price boolean; ck boolean; has_order boolean; delivered boolean; bad int; out boolean; sc int; st lead_stage; prev text; ch channel;
begin
  if contact is null then return; end if;
  select count(*), bool_or(m.body ~* '(price|how much|hw much|cost|amount|naira|₦)') into ins, price
    from messages m join conversations c on c.id = m.conversation_id where c.contact_id = contact and m.direction = 'in';
  select bool_or(c.checkout is not null) into ck from conversations c where c.contact_id = contact;
  select count(*) > 0, bool_or(status = 'delivered'), count(*) filter (where status in ('cancelled', 'refused', 'returned')) into has_order, delivered, bad from orders where contact_id = contact;
  out := private.opted_out(contact);
  sc := least(20, 5 * coalesce(ins, 0)) + case when price then 15 else 0 end + case when ck or has_order then 20 else 0 end
      + case when has_order then 25 else 0 end + case when delivered then 15 else 0 end - 20 * coalesce(bad, 0) - case when out then 15 else 0 end;
  sc := greatest(0, least(100, sc));
  st := case when ck then 'checkout_started' when price then 'high_intent' when ins >= 3 then 'engaged' when ins >= 1 then 'first_contact' else 'new_lead' end;
  prev := private.sys_on();
  select * into l from leads where contact_id = contact order by created_at desc limit 1;
  if l.id is null then
    if coalesce(ins, 0) = 0 then perform private.sys_restore(prev); return; end if;
    select c.channel into ch from conversations c where c.contact_id = contact order by c.created_at limit 1;
    insert into leads(workspace_id, contact_id, source_channel, stage, score, last_activity_at) values (ws, contact, coalesce(ch, 'whatsapp'), st, sc, now());
  else
    -- Stages only move forward through the buying steps; order stages are set by the order itself.
    update leads set score = sc, last_activity_at = now(),
      stage = case when stage in ('new_lead', 'first_contact', 'engaged', 'qualified', 'high_intent', 'negotiating', 'unresponsive', 'follow_up_required') and st > stage then st
                   when stage in ('unresponsive', 'follow_up_required') and st >= 'first_contact' then st
                   else stage end
    where id = l.id;
  end if;
  perform private.sys_restore(prev);
end $$;

create or replace function private.lead_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'in' then perform private.touch_lead(new.workspace_id, (select contact_id from conversations where id = new.conversation_id)); end if;
  return null;
end $$;
create trigger lead_on_message after insert on public.messages for each row execute function private.lead_on_message();
create or replace function private.lead_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform private.touch_lead(new.workspace_id, new.contact_id); return null; end $$;
create trigger lead_on_order after insert or update of status on public.orders for each row execute function private.lead_on_order();
create or replace function private.lead_on_checkout() returns trigger
language plpgsql security definer set search_path = public as $$
begin if new.checkout is distinct from old.checkout then perform private.touch_lead(new.workspace_id, new.contact_id); end if; return null; end $$;
create trigger lead_on_checkout after update of checkout on public.conversations for each row execute function private.lead_on_checkout();
create or replace function private.lead_on_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform private.touch_lead(new.workspace_id, new.contact_id); return null; end $$;
create trigger lead_on_consent after insert on public.consents for each row execute function private.lead_on_consent();
grant execute on function private.lead_on_message(), private.lead_on_order(), private.lead_on_checkout(), private.lead_on_consent() to authenticated, service_role;
