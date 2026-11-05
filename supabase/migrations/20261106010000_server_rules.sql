-- Bizriva CRM — business rules on the server, and the functions the live
-- endpoints call (2026-11-06). Whatever screen, phone or website changes an
-- order, the same things happen:
--   * the lead moves stage; deliveries open and close; COD cash is recorded
--     when delivered; customer lifetime value and refusals are kept;
--   * the receipt number is set; the sale is queued for Meta (Conversions API);
--   * the customer's confirmation / dispatch / receipt / care-guide messages
--     are queued in their chat (status "queued" — the WhatsApp sender sends them);
--   * every change is written to the activity log.
-- Plus: payment matching (staff and provider webhooks), website/form intake,
-- the public order form, order numbers, rate limits, and keys kept in Vault.

-- ───────── nested-safe "system" switch (restore what was there) ─────────
create or replace function private.sys_on() returns text language plpgsql set search_path = '' as $$
declare prev text := coalesce(current_setting('bizriva.system', true), '');
begin perform set_config('bizriva.system', 'on', true); return prev; end $$;
create or replace function private.sys_restore(prev text) returns void language plpgsql set search_path = '' as $$
begin perform set_config('bizriva.system', coalesce(prev, ''), true); end $$;

create or replace function private.sync_amount_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare oid uuid; prev text;
begin
  prev := private.sys_on();
  foreach oid in array array_remove(array[case when tg_op <> 'INSERT' then old.order_id end, case when tg_op <> 'DELETE' then new.order_id end], null) loop
    update orders set amount_paid = greatest(0, (select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) from payments where order_id = oid))
      where id = oid;
  end loop;
  perform private.sys_restore(prev);
  return null;
end $$;

-- ───────────────────────── order numbers ─────────────────────────
create table private.counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  n bigint not null,
  primary key (workspace_id, kind)
);
create or replace function private.next_number(ws uuid, k text, start bigint default 1001) returns bigint
language sql security definer set search_path = private as $$
  insert into private.counters as c (workspace_id, kind, n) values (ws, k, start)
  on conflict (workspace_id, kind) do update set n = c.n + 1
  returning n;
$$;
-- Staff create orders with ref left empty; the server numbers them BZ-1001, BZ-1002…
alter table public.orders alter column ref drop not null;
create or replace function private.number_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ref is null or trim(new.ref) = '' then new.ref := 'BZ-' || private.next_number(new.workspace_id, 'order'); end if;
  return new;
end $$;
create trigger a_number_order before insert on public.orders for each row execute function private.number_order();
alter table public.orders add constraint orders_ref_set check (ref is not null and ref <> '');

-- ───────────────────────── message helpers ─────────────────────────
create or replace function private.money(ws uuid, amount numeric) returns text
language sql stable set search_path = public as $$
  select case w.currency when 'NGN' then '₦' when 'GHS' then 'GH₵' when 'KES' then 'KSh ' when 'USD' then '$' else w.currency || ' ' end
         || to_char(round(amount), 'FM999,999,999,990')
  from workspaces w where w.id = ws;
$$;

-- Queue a message to the customer in their most recent chat (WhatsApp first).
create or replace function private.queue_to_customer(ws uuid, contact uuid, body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare conv uuid; mid uuid; prev text;
begin
  select id into conv from conversations where workspace_id = ws and contact_id = contact
    order by (channel = 'whatsapp') desc, coalesce(last_inbound_at, created_at) desc limit 1;
  if conv is null then return null; end if;
  prev := private.sys_on();
  insert into messages(workspace_id, conversation_id, direction, body, status) values (ws, conv, 'out', body, 'queued') returning id into mid;
  perform private.sys_restore(prev);
  return mid;
end $$;

create or replace function private.order_lines(o public.orders) returns text
language sql stable set search_path = public as $$
  select coalesce(string_agg('• ' || p.name || coalesce(' — ' || v.name, '') || case when i.quantity > 1 then ' × ' || i.quantity else '' end, E'\n' order by p.name), '')
  from order_items i join products p on p.id = i.product_id left join product_variants v on v.id = i.variant_id
  where i.order_id = o.id;
$$;

-- ───────────────────── after an order changes ─────────────────────
create or replace function private.after_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prev text; ws workspaces; c contacts; lead_id uuid; bal numeric; body text; guides text; rider text;
  first_name text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return null; end if;
  prev := private.sys_on();
  select * into ws from workspaces where id = new.workspace_id;
  select * into c from contacts where id = new.contact_id;
  first_name := coalesce(split_part(nullif(trim(c.name), ''), ' ', 1), 'there');
  lead_id := coalesce(new.lead_id, (select id from leads where workspace_id = new.workspace_id and contact_id = new.contact_id order by created_at desc limit 1));

  -- Lead stage follows the order.
  if tg_op = 'INSERT' then
    update leads set stage = 'order_created', last_activity_at = now()
      where id = lead_id and stage not in ('order_created', 'order_confirmed', 'converted');
  elsif new.status = 'confirmed' then
    update leads set stage = 'order_confirmed', last_activity_at = now() where id = lead_id and stage <> 'converted';
  elsif new.status = 'delivered' then
    update leads set stage = 'converted', last_activity_at = now() where id = lead_id;
  elsif new.status = 'cancelled' then
    update leads set stage = 'lost', last_activity_at = now() where id = lead_id and stage not in ('converted');
  end if;

  if tg_op = 'UPDATE' then
    -- Deliveries.
    if new.status = 'ready_for_dispatch' and not exists (select 1 from deliveries where order_id = new.id) then
      insert into deliveries(workspace_id, order_id) values (new.workspace_id, new.id);
    elsif new.status in ('dispatched', 'in_transit') then
      if not exists (select 1 from deliveries where order_id = new.id) then insert into deliveries(workspace_id, order_id) values (new.workspace_id, new.id); end if;
      update deliveries set dispatched_at = coalesce(dispatched_at, now()) where order_id = new.id;
    elsif new.status = 'delivered' then
      bal := new.total - new.amount_paid;
      -- COD: the rider collected the balance; it's revenue only now.
      if bal > 0 then
        insert into payments(workspace_id, order_id, contact_id, kind, method, amount, rider_id)
          values (new.workspace_id, new.id, new.contact_id, 'cod_cash', 'cash', bal, (select rider_id from deliveries where order_id = new.id limit 1));
      end if;
      if not exists (select 1 from deliveries where order_id = new.id) then insert into deliveries(workspace_id, order_id) values (new.workspace_id, new.id); end if;
      update deliveries set delivered_at = now(), outcome = 'delivered', cash_collected = greatest(bal, 0) where order_id = new.id;
      insert into customers(workspace_id, contact_id, first_order_at, lifetime_value) values (new.workspace_id, new.contact_id, now(), new.total)
        on conflict (contact_id) do update set lifetime_value = customers.lifetime_value + excluded.lifetime_value,
          first_order_at = coalesce(customers.first_order_at, excluded.first_order_at);
    elsif new.status = 'refused' then
      update deliveries set outcome = 'refused' where order_id = new.id;
      insert into customers(workspace_id, contact_id, refused_deliveries) values (new.workspace_id, new.contact_id, 1)
        on conflict (contact_id) do update set refused_deliveries = customers.refused_deliveries + 1;
    elsif new.status = 'returned' then
      update deliveries set outcome = 'returned' where order_id = new.id;
      if old.status = 'delivered' then
        update customers set lifetime_value = greatest(0, lifetime_value - new.total) where contact_id = new.contact_id;
      end if;
    end if;

    -- Meta Conversions API: one Purchase per order, at the moment the business chose.
    if exists (select 1 from meta_links m where m.workspace_id = new.workspace_id and m.capi_enabled and m.capi_when = new.status::text) then
      insert into capi_events(workspace_id, order_id, event_id, value, currency)
        values (new.workspace_id, new.id, 'bz_' || new.ref, new.total, ws.currency)
        on conflict (workspace_id, order_id, event_name) do nothing;
    end if;

    -- Customer messages.
    if new.status = 'confirmed' then
      body := format(E'Hi %s, your order %s is confirmed ✅\n%s\nTotal %s%s.\nWe''ll message you when it''s on the way.',
        first_name, new.ref, private.order_lines(new), private.money(new.workspace_id, new.total),
        case when new.payment_method = 'cod' then ' (pay on delivery)' else '' end);
    elsif new.status = 'dispatched' then
      body := format(E'Good news %s! 🚚 Order %s is on its way.\nPlease keep your phone close — the rider will call before arriving.%s',
        first_name, new.ref,
        case when new.total - new.amount_paid > 0 then E'\nAmount to pay on delivery: ' || private.money(new.workspace_id, new.total - new.amount_paid) || '.' else '' end);
    elsif new.status = 'delivered' and coalesce((ws.after_delivery ->> 'receipt')::boolean, true) then
      body := format(E'🧾 *Receipt %s* — %s\nOrder %s · %s\n\n%s\n*Total: %s*\nPaid in full%s\nDelivered %s\n\nThank you for shopping with us 💛 Keep this message as your receipt.',
        new.receipt_no, ws.name, new.ref, coalesce(c.name, ''), private.order_lines(new),
        private.money(new.workspace_id, new.total),
        case when new.payment_method = 'cod' then ' (cash on delivery)' else '' end,
        to_char(now() at time zone ws.timezone, 'FMDD Mon YYYY'));
    end if;
    if body is not null then perform private.queue_to_customer(new.workspace_id, new.contact_id, body); end if;

    if new.status = 'delivered' and coalesce((ws.after_delivery ->> 'careGuide')::boolean, true) then
      select string_agg(E'*' || p.name || E'*\n' || trim(p.care_guide), E'\n\n' order by p.name) into guides
        from products p where p.id in (select product_id from order_items where order_id = new.id) and coalesce(trim(p.care_guide), '') <> '';
      if guides is not null then
        perform private.queue_to_customer(new.workspace_id, new.contact_id,
          E'✨ *How to use and care for your order*\n\n' || guides || E'\n\nQuestions? Reply here any time — we''re happy to help.');
      end if;
    end if;
  end if;

  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (new.workspace_id, auth.uid(), 'order', new.id,
      case when tg_op = 'INSERT' then 'created' else 'status:' || new.status end,
      jsonb_build_object('ref', new.ref, 'from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status, 'total', new.total));
  perform private.sys_restore(prev);
  return null;
end $$;
create trigger after_order after insert or update of status on public.orders for each row execute function private.after_order();

-- ───────────────────── apply a provider payment ─────────────────────
create or replace function private.apply_payment_event(p_event uuid, p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ev payment_events; o orders; due numeric; applied numeric; st text; prev text; n int; prov payment_providers;
  settle jsonb := '[]'::jsonb; left_amt numeric; r record; def settlement_accounts; amt numeric; paid_after numeric;
begin
  select * into ev from payment_events where id = p_event for update;
  select * into o from orders where id = p_order and workspace_id = ev.workspace_id for update;
  if ev.id is null or o.id is null then return 'unmatched'; end if;
  if o.status in ('cancelled', 'returned', 'refused') then return 'unmatched'; end if;
  prev := private.sys_on();
  due := o.total - o.amount_paid;
  applied := least(ev.amount, greatest(due, 0));
  st := case when ev.amount > due then 'over' when applied >= due then 'matched' else 'part' end;
  if applied > 0 then
    insert into payments(workspace_id, order_id, contact_id, kind, method, amount, provider_ref, paid_at)
      values (o.workspace_id, o.id, o.contact_id,
        (case when applied >= due and o.amount_paid = 0 then 'full' when o.amount_paid = 0 then 'deposit' else 'balance' end)::payment_kind,
        case ev.method when 'transfer' then 'bank_transfer' else ev.method end, applied, ev.provider || ':' || ev.provider_ref, ev.received_at);
  end if;
  paid_after := o.amount_paid + applied;
  select count(*) into n from payment_events where order_id = o.id;
  -- Settlement split: category rules first, the rest to the default account.
  left_amt := ev.amount;
  for r in
    select s.percent, a.id, a.label from split_rules s join settlement_accounts a on a.id = s.account_id
    where s.workspace_id = o.workspace_id
      and (s.category = 'all' or s.category in (select p.category from order_items i join products p on p.id = i.product_id where i.order_id = o.id))
  loop
    exit when left_amt <= 0;
    amt := least(round(ev.amount * r.percent / 100), left_amt);
    settle := settle || jsonb_build_object('account_id', r.id, 'label', r.label, 'amount', amt);
    left_amt := left_amt - amt;
  end loop;
  select * into def from settlement_accounts where workspace_id = o.workspace_id order by is_default desc, created_at limit 1;
  if left_amt > 0 and def.id is not null then settle := settle || jsonb_build_object('account_id', def.id, 'label', def.label, 'amount', left_amt); end if;

  update payment_events set order_id = o.id, contact_id = o.contact_id, status = st, settled_to = settle,
    receipt_no = 'RCPT-' || o.ref || '-' || lpad((n + 1)::text, 2, '0')
  where id = ev.id;
  update payment_requests set status = case when paid_after >= o.total then 'paid' else 'part_paid' end
    where order_id = o.id and status in ('sent', 'part_paid');

  select * into prov from payment_providers where workspace_id = o.workspace_id;
  if paid_after >= o.total and coalesce(prov.auto_confirm, true) and o.status = 'pending_verification' then
    update orders set status = 'confirmed' where id = o.id;
  end if;
  if coalesce(prov.auto_receipt, true) then
    perform private.queue_to_customer(o.workspace_id, o.contact_id, concat_ws(E'\n',
      '✅ *Payment received — thank you!*',
      private.money(o.workspace_id, ev.amount) || ' for order ' || o.ref,
      'Receipt: RCPT-' || o.ref || '-' || lpad((n + 1)::text, 2, '0'),
      case when paid_after < o.total then 'Balance left: ' || private.money(o.workspace_id, o.total - paid_after) end,
      case when st = 'over' then 'You paid ' || private.money(o.workspace_id, ev.amount - greatest(due, 0)) || ' more than the balance — we''ll refund or credit it. A team member will confirm.' end));
  end if;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (o.workspace_id, auth.uid(), 'payment', ev.id, 'applied', jsonb_build_object('order', o.ref, 'amount', ev.amount, 'status', st));
  perform private.sys_restore(prev);
  return st;
end $$;

-- Staff: match an unmatched transfer to an order (owners, managers, finance).
drop policy if exists "money roles match payments" on public.payment_events;
create or replace function public.match_payment(p_event uuid, p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from payment_events where id = p_event and status = 'unmatched';
  if ws is null then raise exception 'Payment not found or already matched'; end if;
  if not private.has_role(ws, array['owner','manager','finance']::member_role[]) then raise exception 'Only owners, managers and finance can match payments' using errcode = '42501'; end if;
  if not exists (select 1 from orders where id = p_order and workspace_id = ws and status not in ('cancelled','returned','refused') and total > amount_paid) then
    raise exception 'That order isn''t open for payment';
  end if;
  return private.apply_payment_event(p_event, p_order);
end $$;
revoke execute on function public.match_payment(uuid, uuid) from public, anon;
grant execute on function public.match_payment(uuid, uuid) to authenticated;

-- ───────────────────── keys in Supabase Vault ─────────────────────
-- The key goes straight into Vault; tables keep only the Vault id.
create or replace function public.save_payment_key(p_workspace uuid, p_provider text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not private.has_role(p_workspace, array['owner','finance']::member_role[]) then raise exception 'Only the owner or finance can add a payment key' using errcode = '42501'; end if;
  if p_provider not in ('paystack', 'flutterwave', 'monnify') then raise exception 'Unknown provider'; end if;
  if length(coalesce(p_secret, '')) < 16 then raise exception 'That doesn''t look like a secret key'; end if;
  select key_secret_id into sid from payment_providers where workspace_id = p_workspace;
  if sid is null then
    sid := vault.create_secret(p_secret, 'payments_' || p_workspace::text || '_' || extract(epoch from now())::bigint, p_provider || ' key for workspace ' || p_workspace);
  else
    perform vault.update_secret(sid, p_secret);
  end if;
  insert into payment_providers(workspace_id, provider, key_secret_id) values (p_workspace, p_provider, sid)
    on conflict (workspace_id) do update set provider = excluded.provider, key_secret_id = excluded.key_secret_id;
end $$;
revoke execute on function public.save_payment_key(uuid, text, text) from public, anon;
grant execute on function public.save_payment_key(uuid, text, text) to authenticated;

create or replace function public.save_meta_token(p_workspace uuid, p_ad_account text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not private.has_role(p_workspace, array['owner','manager']::member_role[]) then raise exception 'Only owners and managers can link Meta' using errcode = '42501'; end if;
  if coalesce(p_ad_account, '') !~ '^act_\d+$' then raise exception 'Ad account id looks like act_123456'; end if;
  if length(coalesce(p_token, '')) < 20 then raise exception 'That doesn''t look like a Meta token'; end if;
  select token_secret_id into sid from meta_links where workspace_id = p_workspace;
  if sid is null then sid := vault.create_secret(p_token, 'meta_' || p_workspace::text || '_' || extract(epoch from now())::bigint, 'Meta token for workspace ' || p_workspace);
  else perform vault.update_secret(sid, p_token); end if;
  insert into meta_links(workspace_id, ad_account_id, token_secret_id, connected_by) values (p_workspace, p_ad_account, sid, auth.uid())
    on conflict (workspace_id) do update set ad_account_id = excluded.ad_account_id, token_secret_id = excluded.token_secret_id, connected_at = now();
end $$;
revoke execute on function public.save_meta_token(uuid, text, text) from public, anon;
grant execute on function public.save_meta_token(uuid, text, text) to authenticated;

-- ───────────── functions only the server (Edge Functions) may call ─────────────
-- Executable by service_role only; never by signed-in users or visitors.

create table private.rate_hits (key text not null, at timestamptz not null default now());
create index on private.rate_hits (key, at);
create or replace function public.svc_rate_ok(p_key text, p_max int, p_seconds int) returns boolean
language plpgsql security definer set search_path = private as $$
declare n int;
begin
  delete from private.rate_hits where at < now() - interval '1 day';
  select count(*) into n from private.rate_hits where key = p_key and at > now() - make_interval(secs => p_seconds);
  if n >= p_max then return false; end if;
  insert into private.rate_hits(key) values (p_key);
  return true;
end $$;

create or replace function public.svc_provider_key(p_workspace uuid) returns table(provider text, secret text)
language sql security definer set search_path = public as $$
  select p.provider, s.decrypted_secret from payment_providers p join vault.decrypted_secrets s on s.id = p.key_secret_id
  where p.workspace_id = p_workspace;
$$;

-- Normalise a Nigerian phone to 234XXXXXXXXXX (other countries kept as digits).
create or replace function private.phone_key(p text) returns text language sql immutable set search_path = '' as $$
  select case
    when d ~ '^0\d{10}$' then '234' || substr(d, 2)
    when d ~ '^\d{10}$' and d ~ '^[789]' then '234' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;
create index contacts_phone_key on public.contacts (workspace_id, private.phone_key(phone));

-- Find the person by phone (or email), or add them.
create or replace function private.find_or_add_contact(ws uuid, p_name text, p_phone text, p_email text, p_address text, p_location text, p_landmark text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; k text := private.phone_key(p_phone);
begin
  if length(k) >= 10 then select id into cid from contacts where workspace_id = ws and private.phone_key(phone) = k order by created_at limit 1; end if;
  if cid is null and coalesce(p_email, '') <> '' then select id into cid from contacts where workspace_id = ws and lower(email) = lower(p_email) order by created_at limit 1; end if;
  if cid is null then
    insert into contacts(workspace_id, name, phone, email, address, location, landmark)
      values (ws, left(nullif(trim(p_name), ''), 120), case when length(k) >= 10 then '+' || k end, nullif(lower(trim(p_email)), ''), left(p_address, 300), left(p_location, 120), left(p_landmark, 200))
      returning id into cid;
  else
    update contacts set address = coalesce(address, left(p_address, 300)), location = coalesce(location, left(p_location, 120)),
      landmark = coalesce(landmark, left(p_landmark, 200)), name = coalesce(name, left(nullif(trim(p_name), ''), 120)), updated_at = now()
      where id = cid;
  end if;
  return cid;
end $$;

-- A provider says money arrived. Applied once per provider reference.
create or replace function public.svc_provider_payment(
  p_workspace uuid, p_provider text, p_ref text, p_method text, p_amount numeric,
  p_payer text, p_paid_into text, p_order_ref text, p_raw jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare ev uuid; cid uuid; oid uuid; st text := 'unmatched'; prev text;
begin
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('status', 'ignored', 'reason', 'amount'); end if;
  prev := private.sys_on();
  insert into payment_events(workspace_id, provider, provider_ref, method, amount, payer_name, paid_into, status, raw)
    values (p_workspace, p_provider, p_ref, case when p_method in ('transfer','card','ussd') then p_method else 'transfer' end, p_amount, left(p_payer, 120), p_paid_into, 'unmatched', p_raw)
    on conflict (provider, provider_ref) do nothing returning id into ev;
  if ev is null then perform private.sys_restore(prev); return jsonb_build_object('status', 'duplicate'); end if;
  select contact_id into cid from customer_accounts where workspace_id = p_workspace and account_number = p_paid_into;
  if coalesce(p_order_ref, '') <> '' then
    select id into oid from orders where workspace_id = p_workspace and ref = p_order_ref and status not in ('cancelled','returned','refused') and total > amount_paid;
  end if;
  if oid is null and cid is not null then
    select id into oid from orders where workspace_id = p_workspace and contact_id = cid and status not in ('cancelled','returned','refused') and total > amount_paid
      order by created_at limit 1;
  end if;
  if oid is not null then st := private.apply_payment_event(ev, oid);
  elsif cid is not null then update payment_events set contact_id = cid where id = ev;
  end if;
  perform private.sys_restore(prev);
  return jsonb_build_object('status', st, 'event_id', ev);
end $$;

-- Website / form / store submission (the Edge Function has already flattened and mapped it).
create or replace function public.svc_ingest(p_connection uuid, p_secret text, p_fields jsonb, p_raw jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c connections; ws uuid; cid uuid; lid uuid; conv uuid; oid uuid; prod products; qty int; tot numeric; st text; summary text; prev text;
  ext text := nullif(left(p_fields ->> 'externalId', 120), '');
begin
  select * into c from connections where id = p_connection;
  if c.id is null or not c.active or encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> c.secret_hash then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  ws := c.workspace_id;
  prev := private.sys_on();
  if ext is not null and exists (select 1 from connection_events where connection_id = c.id and external_id = ext and status in ('created_order','created_lead')) then
    insert into connection_events(workspace_id, connection_id, status, summary, raw, external_id) values (ws, c.id, 'duplicate', 'Already received — skipped', p_raw, null);
    perform private.sys_restore(prev);
    return jsonb_build_object('status', 'duplicate');
  end if;
  if length(private.phone_key(p_fields ->> 'phone')) < 10 and coalesce(p_fields ->> 'email', '') = '' then
    insert into connection_events(workspace_id, connection_id, status, summary, raw, external_id) values (ws, c.id, 'failed', 'No phone number or email', p_raw, ext);
    perform private.sys_restore(prev);
    return jsonb_build_object('status', 'failed', 'reason', 'A phone number or email is required');
  end if;

  cid := private.find_or_add_contact(ws, p_fields ->> 'name', p_fields ->> 'phone', p_fields ->> 'email', p_fields ->> 'address', p_fields ->> 'city', p_fields ->> 'landmark');
  insert into leads(workspace_id, contact_id, source_channel, ad_campaign_name) values (ws, cid, 'webchat', left(p_fields ->> 'source', 200)) returning id into lid;
  select id into conv from conversations where workspace_id = ws and contact_id = cid and channel = 'webchat' and status <> 'closed' order by created_at desc limit 1;
  if conv is null then insert into conversations(workspace_id, contact_id, lead_id, channel) values (ws, cid, lid, 'webchat') returning id into conv; end if;
  summary := concat_ws(' · ', c.name, nullif(p_fields ->> 'product', ''), nullif(p_fields ->> 'quantity', ''), nullif(p_fields ->> 'note', ''));
  insert into messages(workspace_id, conversation_id, direction, body, status) values (ws, conv, 'in', left('From ' || summary, 2000), 'received');
  update conversations set last_inbound_at = now() where id = conv;

  if c.create_as = 'order' and (coalesce(p_fields ->> 'product', '') <> '' or coalesce((p_fields ->> 'total')::numeric, 0) > 0) then
    select * into prod from products where workspace_id = ws and active
      and (lower(name) = lower(p_fields ->> 'product') or lower(sku) = lower(p_fields ->> 'product') or position(lower(name) in lower(coalesce(p_fields ->> 'product', ''))) > 0)
      order by length(name) desc limit 1;
    qty := greatest(1, least(coalesce(nullif(regexp_replace(coalesce(p_fields ->> 'quantity', ''), '\D', '', 'g'), '')::int, 1), 100));
    -- Price from your catalogue when the product is known; otherwise the store's own total.
    tot := case when prod.id is not null then coalesce(prod.promo_price, prod.price) * qty else round(coalesce((p_fields ->> 'total')::numeric, 0), 2) end;
    insert into orders(workspace_id, contact_id, lead_id, conversation_id, status, payment_method, subtotal, total, delivery_address, notes)
      values (ws, cid, lid, conv, 'pending_verification', 'cod', tot, tot, left(p_fields ->> 'address', 300),
        left(concat_ws(E'\n', 'From ' || c.name, case when prod.id is null then 'Product: ' || (p_fields ->> 'product') end, p_fields ->> 'note'), 1000))
      returning id into oid;
    if prod.id is not null then insert into order_items(workspace_id, order_id, product_id, quantity, unit_price) values (ws, oid, prod.id, qty, coalesce(prod.promo_price, prod.price)); end if;
    st := 'created_order';
  else
    st := 'created_lead';
  end if;
  insert into connection_events(workspace_id, connection_id, status, summary, raw, external_id, contact_id, order_id)
    values (ws, c.id, st, left(summary, 300), p_raw, ext, cid, oid);
  update connections set last_event_at = now() where id = c.id;
  perform private.sys_restore(prev);
  return jsonb_build_object('status', st, 'order_ref', (select ref from orders where id = oid));
end $$;

-- Public order form: prices come from the form, never from the visitor's browser.
create or replace function public.svc_public_form(p_form uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'name', f.name, 'headline', f.headline, 'banner', f.banner, 'packages', f.packages,
    'fields', f.fields, 'pay_on_delivery', f.pay_on_delivery, 'thank_you', f.thank_you, 'business', w.name, 'currency', w.currency,
    'product', p.name, 'description', p.description)
  from order_forms f join workspaces w on w.id = f.workspace_id join products p on p.id = f.product_id
  where f.id = p_form and f.active;
$$;

create or replace function public.svc_submit_form(p_form uuid, p_package text, p_name text, p_phone text, p_address text, p_city text, p_region text, p_ad_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f order_forms; pkg jsonb; price numeric; qty int; cid uuid; lid uuid; oid uuid; existing text; prev text;
begin
  select * into f from order_forms where id = p_form and active;
  if f.id is null then return jsonb_build_object('status', 'not_found'); end if;
  select x into pkg from jsonb_array_elements(f.packages) x where x ->> 'id' = p_package;
  if pkg is null then return jsonb_build_object('status', 'invalid', 'reason', 'Choose a package'); end if;
  if length(private.phone_key(p_phone)) not between 10 and 15 then return jsonb_build_object('status', 'invalid', 'reason', 'Enter a valid phone number'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('status', 'invalid', 'reason', 'Enter your name'); end if;
  if 'address' = any(f.fields) and coalesce(trim(p_address), '') = '' then return jsonb_build_object('status', 'invalid', 'reason', 'Enter your delivery address'); end if;
  price := (pkg ->> 'price')::numeric; qty := greatest(1, coalesce((pkg ->> 'qty')::int, 1));
  -- Same phone on the same form within 15 minutes = the same order (double taps, refreshes).
  select o.ref into existing from order_form_submissions s join orders o on o.id = s.order_id join contacts c on c.id = s.contact_id
    where s.form_id = f.id and s.created_at > now() - interval '15 minutes' and private.phone_key(c.phone) = private.phone_key(p_phone) limit 1;
  if existing is not null then return jsonb_build_object('status', 'duplicate', 'order_ref', existing, 'thank_you', f.thank_you); end if;
  prev := private.sys_on();
  cid := private.find_or_add_contact(f.workspace_id, p_name, p_phone, null, p_address, p_city, null);
  insert into leads(workspace_id, contact_id, source_channel, ad_campaign_name) values (f.workspace_id, cid, 'webchat', left(p_ad_source, 200)) returning id into lid;
  insert into orders(workspace_id, contact_id, lead_id, form_id, status, payment_method, subtotal, total, delivery_address, notes)
    values (f.workspace_id, cid, lid, f.id, 'pending_verification', (case when f.pay_on_delivery then 'cod' else 'payment_link' end)::payment_method, price, price,
      left(concat_ws(', ', p_address, p_city), 300), left('Order form: ' || f.name || ' · ' || coalesce(pkg ->> 'label', ''), 500))
    returning id into oid;
  insert into order_items(workspace_id, order_id, product_id, quantity, unit_price) values (f.workspace_id, oid, f.product_id, qty, round(price / qty, 2));
  insert into order_form_submissions(workspace_id, form_id, order_id, contact_id, package_id, total, region, ad_source)
    values (f.workspace_id, f.id, oid, cid, p_package, price, left(p_region, 80), left(p_ad_source, 200));
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'created', 'order_ref', (select ref from orders where id = oid), 'thank_you', f.thank_you);
end $$;

create or replace function public.svc_form_event(p_form uuid, p_kind text, p_field text, p_visitor text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if p_kind not in ('view', 'start', 'drop') then return; end if;
  select workspace_id into ws from order_forms where id = p_form and active;
  if ws is null then return; end if;
  insert into order_form_events(workspace_id, form_id, kind, field, visitor_id) values (ws, p_form, p_kind, left(p_field, 40), left(p_visitor, 64));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'svc_rate_ok(text, int, int)', 'svc_provider_key(uuid)',
    'svc_provider_payment(uuid, text, text, text, numeric, text, text, text, jsonb)',
    'svc_ingest(uuid, text, jsonb, jsonb)', 'svc_public_form(uuid)',
    'svc_submit_form(uuid, text, text, text, text, text, text, text)', 'svc_form_event(uuid, text, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
-- The private schema isn't reachable through the web API; signed-in users and
-- the server need execute only so triggers and policies can call these helpers.
revoke execute on all functions in schema private from public, anon;
grant usage on schema private to service_role;
grant execute on all functions in schema private to authenticated, service_role;
