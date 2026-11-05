-- Bizriva CRM — loophole fixes (2026-11-06)
--
-- What a staff member, a customer or an outsider could previously do, and
-- what stops them now:
--   1. A manager could promote themselves (or anyone) to owner, or remove the
--      owner. → Only owners touch owner rows; nobody changes their own role;
--      a business always keeps at least one owner.
--   2. A manager could invite someone as owner. → Owner invites need an owner.
--      An invite can't downgrade an owner, and needs a confirmed email.
--   3. Owners could change their own plan (billing). → Server only.
--   4. Any member could delete orders, contacts, payments or the activity log.
--      → Deletes need owner/manager (payments: owner/finance); the activity
--      log and consent records can never be changed or deleted.
--   5. Any member could type a new "amount paid" on an order, or insert fake
--      payment-provider/webhook events. → Amount paid is the sum of recorded
--      payments; provider events are written only by the server.
--   6. Orders could jump statuses (cancelled → delivered), be dispatched
--      unverified, or have prices changed after dispatch. → Status rules,
--      COD verification before dispatch, totals locked after dispatch.
--   7. A row could point at another business's contact/order/product.
--      → Every link is checked to be in the same business.
--   8. Message "sent by" and activity "actor" could be faked. → Set by the server.

-- ───────────── "system" switch for trusted server functions ─────────────
-- "System" means: the server (service role, Edge Functions, migrations) or a
-- trusted security-definer function below that switches bizriva.system on for
-- the one statement it needs. Signed-in users and visitors (JWT role
-- authenticated/anon) are never system: the web API can't run set_config.
create or replace function private.is_system() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('bizriva.system', true), '') = 'on'
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'none') not in ('authenticated', 'anon');
$$;
grant execute on function private.is_system() to authenticated;

-- ───────────────────────── 1. team & owners ─────────────────────────
create or replace function private.guard_members() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_role member_role; target_ws uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  if private.is_system() then return coalesce(new, old); end if;
  -- Whole business being deleted: let the cascade through.
  if tg_op = 'DELETE' and not exists (select 1 from workspaces where id = old.workspace_id) then return old; end if;
  select role into my_role from workspace_members where workspace_id = target_ws and user_id = me;
  if tg_op in ('UPDATE', 'DELETE') and old.user_id = me and tg_op = 'UPDATE' and new.role <> old.role then
    raise exception 'You can''t change your own role' using errcode = '42501';
  end if;
  if my_role is distinct from 'owner' and (
       (tg_op <> 'DELETE' and new.role = 'owner') or (tg_op <> 'INSERT' and old.role = 'owner')) then
    raise exception 'Only an owner can add, change or remove an owner' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' and old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from workspace_members where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'A business must keep at least one owner' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.user_id <> old.user_id) then
    raise exception 'Move people by inviting them, not by editing the row' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_members before insert or update or delete on public.workspace_members
  for each row execute function private.guard_members();

-- Split the "for all" team policy so reads aren't evaluated twice (performance advisor).
drop policy "owners and managers manage the team" on public.workspace_members;
drop policy "members see their own memberships" on public.workspace_members;
drop policy "members see their team" on public.workspace_members;
create policy "members see their team" on public.workspace_members for select
  using (user_id = (select auth.uid()) or private.is_member(workspace_id));
create policy "owners and managers add people" on public.workspace_members for insert
  with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create policy "owners and managers change roles" on public.workspace_members for update
  using (private.has_role(workspace_id, array['owner','manager']::member_role[]))
  with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create policy "owners and managers remove people; anyone can leave" on public.workspace_members for delete
  using (user_id = (select auth.uid()) or private.has_role(workspace_id, array['owner','manager']::member_role[]));

-- ───────────────────────── 2. invites ─────────────────────────
create or replace function private.guard_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if new.role = 'owner' and not private.has_role(new.workspace_id, array['owner']::member_role[]) then
    raise exception 'Only an owner can invite another owner' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.invited_by := auth.uid();
    new.accepted_at := null;
    new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '30 days');
  else
    new.token := old.token; new.invited_by := old.invited_by; new.accepted_at := old.accepted_at;
  end if;
  new.email := lower(trim(new.email));
  return new;
end $$;
create trigger guard_invites before insert or update on public.workspace_invites
  for each row execute function private.guard_invites();

create or replace function public.accept_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv workspace_invites; u auth.users;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into u from auth.users where id = auth.uid();
  if u.email_confirmed_at is null then raise exception 'Confirm your email address first'; end if;
  select * into inv from workspace_invites where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'This invite is invalid or has expired'; end if;
  if lower(inv.email) <> lower(u.email) then raise exception 'This invite was sent to a different email address'; end if;
  perform set_config('bizriva.system', 'on', true);
  insert into workspace_members(workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do update set role = excluded.role
    where workspace_members.role <> 'owner'; -- an invite never downgrades an owner
  update workspace_invites set accepted_at = now() where id = inv.id;
  perform set_config('bizriva.system', 'off', true);
  return inv.workspace_id;
end $$;

create or replace function public.create_workspace(p_name text, p_currency text default 'NGN')
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(trim(p_name), '') = '' or length(trim(p_name)) > 120 then raise exception 'Business name is required (up to 120 characters)'; end if;
  if coalesce(p_currency, 'NGN') !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code like NGN'; end if;
  -- Stops one account creating thousands of businesses.
  if (select count(*) from workspace_members where user_id = auth.uid() and role = 'owner') >= 10 then
    raise exception 'You already own 10 businesses';
  end if;
  perform set_config('bizriva.system', 'on', true);
  insert into workspaces(name, currency) values (trim(p_name), coalesce(nullif(p_currency, ''), 'NGN')) returning id into ws;
  insert into workspace_members(workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  perform set_config('bizriva.system', 'off', true);
  return ws;
end $$;

-- ───────────────────────── 3. plan is server-only ─────────────────────────
create or replace function private.guard_workspace() returns trigger
language plpgsql set search_path = public as $$
begin
  if not private.is_system() and new.plan is distinct from old.plan then
    raise exception 'The plan changes through billing, not here' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_workspace before update on public.workspaces
  for each row execute function private.guard_workspace();

-- ───────────────────────── 4. who may delete ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','contact_identities','leads','customers','conversations','messages','products','product_variants',
    'media_assets','orders','order_items','cod_verifications','deliveries','followup_rules','complaints',
    'order_forms','order_form_submissions','payment_requests','chat_imports','contact_facts','knowledge_entries','message_templates'
  ] loop
    execute format('create policy "owners and managers delete" on public.%I as restrictive for delete using (private.has_role(workspace_id, array[''owner'',''manager'']::public.member_role[]))', t);
  end loop;
end $$;
create policy "owner or finance delete payments" on public.payments as restrictive for delete
  using (private.has_role(workspace_id, array['owner','finance']::member_role[]));
-- The activity log and consent records are evidence: append-only.
create policy "activity log is append-only (update)" on public.activity_log as restrictive for update using (false);
create policy "activity log is append-only (delete)" on public.activity_log as restrictive for delete using (false);
create policy "consents are append-only (update)" on public.consents as restrictive for update using (false);
create policy "consents are append-only (delete)" on public.consents as restrictive for delete using (false);

-- ───────────── 5. server-written tables are read-only to staff ─────────────
drop policy "workspace members only" on public.webhook_events;
create policy "members read webhook events" on public.webhook_events for select using (private.is_member(workspace_id));
drop policy "workspace members only" on public.order_form_events;
create policy "members read form analytics" on public.order_form_events for select using (private.is_member(workspace_id));
drop policy "workspace members only" on public.order_form_submissions;
create policy "members read form orders" on public.order_form_submissions for select using (private.is_member(workspace_id));
create policy "members fix form orders" on public.order_form_submissions for update
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
-- Customer account numbers come from the provider only.
-- (customer_accounts and payment_events already have no insert policy.)

-- Matching a provider payment may only set which order/customer it belongs to.
create or replace function private.guard_payment_events() returns trigger
language plpgsql set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if old.status <> 'unmatched' then raise exception 'This payment is already matched' using errcode = '42501'; end if;
  if (new.provider, new.provider_ref, new.method, new.amount, new.paid_into, new.workspace_id, new.received_at) is distinct from
     (old.provider, old.provider_ref, old.method, old.amount, old.paid_into, old.workspace_id, old.received_at)
     or new.raw is distinct from old.raw then
    raise exception 'Only the order a payment belongs to can be set' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_payment_events before update on public.payment_events
  for each row execute function private.guard_payment_events();

-- ───────────────────────── money integrity ─────────────────────────
alter table public.orders
  add constraint orders_money_non_negative check (subtotal >= 0 and discount >= 0 and delivery_fee >= 0 and total >= 0),
  add constraint orders_discount_le_subtotal check (discount <= subtotal),
  add constraint orders_paid_le_total check (amount_paid <= total);
alter table public.products add constraint products_price_ok check (price >= 0 and (promo_price is null or (promo_price >= 0 and promo_price <= price)));
alter table public.products add constraint products_stock_ok check (stock is null or stock >= 0);
alter table public.order_items add constraint order_items_price_ok check (unit_price >= 0);
alter table public.split_rules add constraint split_rules_unique unique (workspace_id, category, account_id);
alter table public.ad_drafts add constraint ad_drafts_placements_ok check (placements <@ array['fb_feed','ig_feed','stories','reels'] and cardinality(placements) > 0);

-- Splits for one category can't add up to more than 100%.
create or replace function private.guard_splits() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select coalesce(sum(percent), 0) from split_rules where workspace_id = new.workspace_id and category = new.category and id <> new.id) + new.percent > 100 then
    raise exception 'Splits for "%" add up to more than 100%%', new.category using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_splits before insert or update on public.split_rules for each row execute function private.guard_splits();

-- Payments: right order, right customer, never more than the balance.
create or replace function private.guard_payments() returns trigger
language plpgsql set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = new.order_id;
  if not found or o.workspace_id <> new.workspace_id then raise exception 'Order not found in this business' using errcode = '23503'; end if;
  new.contact_id := o.contact_id;
  if tg_op = 'UPDATE' and (new.amount <> old.amount or new.kind <> old.kind or new.order_id <> old.order_id) and not private.is_system() then
    raise exception 'A recorded payment can''t be edited — record a refund instead' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.kind = 'refund' then
      if new.amount > o.amount_paid then raise exception 'Refund is more than what was paid' using errcode = '23514'; end if;
    else
      if o.status in ('cancelled', 'returned', 'refused') then raise exception 'Order % is %, it can''t take a payment', o.ref, o.status using errcode = '23514'; end if;
      if new.amount > o.total - o.amount_paid then raise exception 'Payment is more than the balance on %', o.ref using errcode = '23514'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_payments before insert or update on public.payments for each row execute function private.guard_payments();

-- Amount paid on the order always equals the payments recorded against it.
create or replace function private.sync_amount_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  foreach oid in array array_remove(array[case when tg_op <> 'INSERT' then old.order_id end, case when tg_op <> 'DELETE' then new.order_id end], null) loop
    perform set_config('bizriva.system', 'on', true);
    update orders set amount_paid = greatest(0, (select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) from payments where order_id = oid))
      where id = oid;
    perform set_config('bizriva.system', 'off', true);
  end loop;
  return null;
end $$;
create trigger sync_amount_paid after insert or update or delete on public.payments for each row execute function private.sync_amount_paid();

-- ───────────────────────── 6. order rules ─────────────────────────
create or replace function private.can_move(f order_status, t order_status) returns boolean
language sql immutable set search_path = public as $$
  select case
    when f = t then false
    when f in ('cancelled', 'returned') then false
    when t = 'pending_verification' then false
    when t = 'cancelled' then f in ('pending_verification', 'confirmed', 'processing', 'ready_for_dispatch')
    when t = 'refused' then f in ('ready_for_dispatch', 'dispatched', 'in_transit')
    when t = 'returned' then f in ('dispatched', 'in_transit', 'delivered', 'refused')
    when f in ('refused', 'delivered') then false
    when f = 'pending_verification' then t = 'confirmed'
    else array_position(array['confirmed','processing','ready_for_dispatch','dispatched','in_transit','delivered']::order_status[], t)
       > array_position(array['confirmed','processing','ready_for_dispatch','dispatched','in_transit','delivered']::order_status[], f)
  end;
$$;

create or replace function private.guard_orders() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_system() then
      if new.status not in ('pending_verification', 'confirmed') then raise exception 'New orders start as pending or confirmed' using errcode = '23514'; end if;
      new.amount_paid := 0; -- money arrives as payments
    end if;
    if new.status = 'confirmed' then new.customer_confirmed_at := coalesce(new.customer_confirmed_at, now()); end if;
    return new;
  end if;
  if new.amount_paid <> old.amount_paid and not private.is_system() then
    raise exception 'Record a payment instead of editing the amount paid' using errcode = '42501';
  end if;
  if (new.workspace_id, new.ref) is distinct from (old.workspace_id, old.ref) then
    raise exception 'Order number and business can''t change' using errcode = '42501';
  end if;
  if old.status in ('dispatched', 'in_transit', 'delivered', 'refused', 'returned', 'cancelled')
     and (new.subtotal, new.discount, new.delivery_fee, new.total, new.contact_id) is distinct from (old.subtotal, old.discount, old.delivery_fee, old.total, old.contact_id) then
    raise exception 'Prices and customer are locked once an order has left (status %)', old.status using errcode = '42501';
  end if;
  if new.total < new.amount_paid then raise exception 'Total can''t be less than what the customer already paid' using errcode = '23514'; end if;
  if new.status <> old.status then
    if not private.can_move(old.status, new.status) then
      raise exception 'An order can''t go from % to %', replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ') using errcode = '23514';
    end if;
    if new.status = 'confirmed' then new.customer_confirmed_at := coalesce(new.customer_confirmed_at, now()); end if;
    -- Nothing leaves unverified: COD needs the customer's confirmation; prepaid needs the money.
    if new.status = 'ready_for_dispatch' and not (
         (new.payment_method = 'cod' and new.customer_confirmed_at is not null)
      or (new.payment_method in ('deposit', 'part_payment') and new.amount_paid > 0)
      or (new.payment_method in ('online', 'payment_link') and new.amount_paid >= new.total)
      or new.amount_paid >= new.total) then
      raise exception 'Order % isn''t verified or paid yet, so it can''t be dispatched', new.ref using errcode = '23514';
    end if;
    if new.status = 'delivered' then new.receipt_no := coalesce(new.receipt_no, 'RCPT-' || new.ref); end if;
  end if;
  return new;
end $$;
create trigger guard_orders before insert or update on public.orders for each row execute function private.guard_orders();

-- ───────────────────── 7. same-business links ─────────────────────
-- guard_same_ws('col', 'table', 'col2', 'table2', …): each non-null column
-- must point at a row in the same business.
create or replace function private.guard_same_ws() returns trigger
language plpgsql security definer set search_path = public as $$
declare i int := 0; col text; tbl text; ref_id text; ws uuid; row_json jsonb := to_jsonb(new);
begin
  while i < tg_nargs loop
    col := tg_argv[i]; tbl := tg_argv[i + 1]; i := i + 2;
    ref_id := row_json ->> col;
    continue when ref_id is null;
    execute format('select workspace_id from public.%I where id = $1', tbl) into ws using ref_id::uuid;
    if ws is distinct from (row_json ->> 'workspace_id')::uuid then
      raise exception '% must belong to the same business', col using errcode = '23503';
    end if;
  end loop;
  return new;
end $$;

do $$
declare spec text[]; specs text[][] := array[
  array['contact_identities', 'contact_id,contacts'],
  array['leads', 'contact_id,contacts'],
  array['customers', 'contact_id,contacts'],
  array['conversations', 'contact_id,contacts,lead_id,leads'],
  array['messages', 'conversation_id,conversations,media_asset_id,media_assets'],
  array['product_variants', 'product_id,products'],
  array['media_assets', 'product_id,products'],
  array['orders', 'contact_id,contacts,lead_id,leads,conversation_id,conversations,form_id,order_forms'],
  array['order_items', 'order_id,orders,product_id,products,variant_id,product_variants'],
  array['cod_verifications', 'order_id,orders'],
  array['deliveries', 'order_id,orders'],
  array['followup_jobs', 'rule_id,followup_rules,conversation_id,conversations'],
  array['consents', 'contact_id,contacts'],
  array['payments', 'order_id,orders'],
  array['order_forms', 'product_id,products'],
  array['order_form_submissions', 'form_id,order_forms,order_id,orders,contact_id,contacts'],
  array['order_form_events', 'form_id,order_forms'],
  array['complaints', 'conversation_id,conversations,contact_id,contacts,order_id,orders'],
  array['calendar_events', 'contact_id,contacts,order_id,orders'],
  array['chat_imports', 'conversation_id,conversations'],
  array['contact_facts', 'contact_id,contacts'],
  array['connection_events', 'connection_id,connections,contact_id,contacts,order_id,orders'],
  array['ad_drafts', 'product_id,products,form_id,order_forms'],
  array['capi_events', 'order_id,orders'],
  array['customer_accounts', 'contact_id,contacts'],
  array['payment_requests', 'order_id,orders,contact_id,contacts'],
  array['payment_events', 'contact_id,contacts,order_id,orders'],
  array['split_rules', 'account_id,settlement_accounts']
];
begin
  foreach spec slice 1 in array specs loop
    execute format('create trigger guard_same_ws before insert or update on public.%I for each row execute function private.guard_same_ws(%s)',
      spec[1], (select string_agg(quote_literal(x), ', ') from unnest(string_to_array(spec[2], ',')) x));
  end loop;
end $$;

-- ───────────────── 8. who did it is set by the server ─────────────────
create or replace function private.stamp_actor() returns trigger
language plpgsql set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if tg_table_name = 'messages' then
    new.sent_by := case when new.direction = 'out' then auth.uid() end;
    new.imported := coalesce(new.imported, false);
  elsif tg_table_name = 'activity_log' then new.actor := auth.uid();
  elsif tg_table_name = 'contact_facts' then new.created_by := auth.uid();
  elsif tg_table_name in ('calendar_events', 'ad_drafts', 'payment_requests') then new.created_by := auth.uid();
  elsif tg_table_name = 'chat_imports' then new.imported_by := auth.uid();
  elsif tg_table_name = 'meta_links' then new.connected_by := auth.uid();
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['messages','activity_log','contact_facts','calendar_events','ad_drafts','payment_requests','chat_imports','meta_links'] loop
    execute format('create trigger stamp_actor before insert on public.%I for each row execute function private.stamp_actor()', t);
  end loop;
end $$;
-- Staff can't mark an outgoing message as an incoming customer message (or fake its delivery status).
create or replace function private.guard_messages() returns trigger
language plpgsql set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if tg_op = 'INSERT' then
    if new.direction = 'in' and not coalesce(new.imported, false) then raise exception 'Customer messages arrive from the channel, not from staff' using errcode = '42501'; end if;
    if new.direction = 'out' then new.status := 'queued'; new.provider_message_id := null; end if;
  else
    if (new.body, new.direction, new.conversation_id, new.status, new.provider_message_id, new.created_at) is distinct from
       (old.body, old.direction, old.conversation_id, old.status, old.provider_message_id, old.created_at) then
      raise exception 'Sent messages can''t be edited' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_messages before insert or update on public.messages for each row execute function private.guard_messages();

-- ───────────────────── performance advisor fixes ─────────────────────
drop policy "members see ads; owners and managers change them" on public.ad_drafts;
drop policy "owners and managers write ads" on public.ad_drafts;
create policy "members see ads" on public.ad_drafts for select using (private.is_member(workspace_id));
create policy "owners and managers create ads" on public.ad_drafts for insert with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create policy "owners and managers change ads" on public.ad_drafts for update using (private.has_role(workspace_id, array['owner','manager']::member_role[])) with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create policy "owners and managers delete ads" on public.ad_drafts for delete using (private.has_role(workspace_id, array['owner','manager']::member_role[]));

-- An index for every foreign key that doesn't have one.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, string_agg(quote_ident(a.attname), ', ' order by k.ord) as cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey)
    group by c.conrelid, c.conname
  loop
    execute format('create index if not exists %I on %s (%s)', left(r.conname, 59) || '_idx', r.tbl, r.cols);
  end loop;
end $$;
