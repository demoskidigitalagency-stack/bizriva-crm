-- Bizriva CRM — change or cancel an order before it leaves, with its history (2026-11-06).
--
-- edit_order: new items (priced from the catalogue, never from the screen),
-- delivery fee, discount, address and note — only before dispatch, by an
-- owner, manager or the agent the order is assigned to. Only owners and
-- managers can give a discount. The change is written to the activity log
-- with what it was before.
-- cancel_order: cancels with a reason (kept in the history).

create or replace function public.edit_order(p_order uuid, p_items jsonb, p_delivery_fee numeric, p_discount numeric, p_address text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; it jsonb; p products; pv product_variants; qty int; unit numeric; sub numeric := 0; lines jsonb := '[]'; before jsonb; disc numeric; fee numeric;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null or not private.is_member(o.workspace_id) then raise exception 'Order not found' using errcode = '42501'; end if;
  if not (private.has_role(o.workspace_id, array['owner','manager']::member_role[]) or o.assigned_to = auth.uid()) then
    raise exception 'Only the owner, a manager or the agent on this order can change it' using errcode = '42501';
  end if;
  if o.status not in ('pending_verification', 'confirmed', 'processing', 'ready_for_dispatch') then
    raise exception 'Order % has already left (or is closed), so it can''t be changed', o.ref using errcode = '23514';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item' using errcode = '23514'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = (it ->> 'product_id')::uuid and workspace_id = o.workspace_id;
    if p.id is null then raise exception 'A product on this order isn''t in your catalogue' using errcode = '23503'; end if;
    pv := null;
    if nullif(it ->> 'variant_id', '') is not null then
      select * into pv from product_variants where id = (it ->> 'variant_id')::uuid and product_id = p.id;
      if pv.id is null then raise exception 'That option of % no longer exists', p.name using errcode = '23503'; end if;
    elsif exists (select 1 from product_variants where product_id = p.id) then
      raise exception 'Choose which option of % the customer wants', p.name using errcode = '23514';
    end if;
    qty := (it ->> 'quantity')::int;
    if qty is null or qty < 1 or qty > 999 then raise exception 'Quantity for % must be between 1 and 999', p.name using errcode = '23514'; end if;
    unit := coalesce(pv.price, p.promo_price, p.price);
    lines := lines || jsonb_build_object('product_id', p.id, 'variant_id', pv.id, 'qty', qty, 'price', unit);
    sub := sub + unit * qty;
  end loop;
  fee := greatest(coalesce(p_delivery_fee, o.delivery_fee), 0);
  disc := greatest(coalesce(p_discount, o.discount), 0);
  if disc > o.discount and not private.has_role(o.workspace_id, array['owner','manager']::member_role[]) then
    raise exception 'Only an owner or manager can give a discount' using errcode = '42501';
  end if;
  if disc > sub then raise exception 'The discount is more than the items cost' using errcode = '23514'; end if;
  if sub - disc + fee < o.amount_paid then raise exception 'The new total is less than what the customer already paid' using errcode = '23514'; end if;

  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object('product', pr.name, 'qty', i.quantity, 'price', i.unit_price)), '[]'), 'total', o.total, 'fee', o.delivery_fee, 'discount', o.discount, 'address', o.delivery_address)
    into before from order_items i join products pr on pr.id = i.product_id where i.order_id = o.id;
  delete from order_items where order_id = o.id;
  insert into order_items(workspace_id, order_id, product_id, variant_id, quantity, unit_price)
    select o.workspace_id, o.id, (l ->> 'product_id')::uuid, nullif(l ->> 'variant_id', '')::uuid, (l ->> 'qty')::int, (l ->> 'price')::numeric from jsonb_array_elements(lines) l;
  update orders set subtotal = sub, discount = disc, delivery_fee = fee, total = sub - disc + fee,
    delivery_address = coalesce(nullif(btrim(p_address), ''), delivery_address), notes = coalesce(nullif(btrim(p_note), ''), notes)
    where id = o.id;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (o.workspace_id, auth.uid(), 'order', o.id, 'edited', jsonb_build_object('ref', o.ref, 'before', before, 'total', sub - disc + fee));
  return jsonb_build_object('ok', true, 'total', sub - disc + fee);
end $$;
revoke execute on function public.edit_order(uuid, jsonb, numeric, numeric, text, text) from public, anon;
grant execute on function public.edit_order(uuid, jsonb, numeric, numeric, text, text) to authenticated;

create or replace function public.cancel_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null or not private.is_member(o.workspace_id) then raise exception 'Order not found' using errcode = '42501'; end if;
  if not (private.has_role(o.workspace_id, array['owner','manager']::member_role[]) or o.assigned_to = auth.uid()) then
    raise exception 'Only the owner, a manager or the agent on this order can cancel it' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Say why the order is cancelled' using errcode = '23514'; end if;
  update orders set status = 'cancelled', notes = concat_ws(E'\n', nullif(notes, ''), 'Cancelled: ' || left(btrim(p_reason), 300)) where id = o.id;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (o.workspace_id, auth.uid(), 'order', o.id, 'cancel_reason', jsonb_build_object('ref', o.ref, 'reason', left(btrim(p_reason), 300)));
end $$;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
