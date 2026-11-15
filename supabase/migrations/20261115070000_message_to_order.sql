-- Message to order: the owner checks the drafts Bizriva read from a chat message and creates
-- them in one go. Finds the customer by phone (or creates them), then a pending order with its
-- items, so it goes through the usual confirmation queue. Nothing is created without the click.
create or replace function public.create_order_from_message(p_workspace uuid, p_draft jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; oid uuid; conv uuid; sub numeric := 0; fee numeric; dep numeric; it jsonb; pr record; n int := 0;
  ph text := regexp_replace(coalesce(p_draft ->> 'phone', ''), '\D', '', 'g');
  src uuid := nullif(p_draft ->> 'from_contact', '')::uuid;
begin
  if not private.has_role(p_workspace, array['owner', 'manager', 'sales']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(p_draft -> 'items', '[]')) = 0 then raise exception 'Pick at least one product' using errcode = '22023'; end if;
  if length(ph) >= 9 then
    cid := private.find_or_add_contact(p_workspace, nullif(btrim(p_draft ->> 'name'), ''), '+' || ph, null, nullif(btrim(p_draft ->> 'address'), ''), nullif(btrim(p_draft ->> 'town'), ''), null);
  elsif src is not null and exists (select 1 from contacts where id = src and workspace_id = p_workspace) then
    cid := src;   -- the customer's own message, no phone written: it's them
  else
    raise exception 'Add the customer''s phone number' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(p_draft -> 'items') loop
    select id, price into pr from products where id = (it ->> 'product_id')::uuid and workspace_id = p_workspace;
    if pr.id is null then raise exception 'Product not found' using errcode = '22023'; end if;
    sub := sub + pr.price * greatest(1, least(500, coalesce((it ->> 'qty')::int, 1)));
  end loop;
  fee := greatest(0, coalesce((p_draft ->> 'delivery_fee')::numeric, 0));
  dep := greatest(0, coalesce((p_draft ->> 'deposit')::numeric, 0));
  select id into conv from conversations where workspace_id = p_workspace and contact_id = coalesce(src, cid) order by created_at desc limit 1;
  insert into orders(workspace_id, contact_id, conversation_id, subtotal, discount, delivery_fee, total, payment_method, channel, delivery_address, notes)
    values (p_workspace, cid, case when src is null or src = cid then conv end, sub, 0, fee, sub + fee,
      (case when dep > 0 then 'deposit' else 'cod' end)::payment_method, 'whatsapp',
      nullif(btrim(concat_ws(', ', p_draft ->> 'address', p_draft ->> 'town')), ''),
      left(concat_ws(E'\n', case when dep > 0 then 'Deposit mentioned in chat: ' || dep end,
        case when src is not null and src <> cid then 'From a message by ' || coalesce((select name from contacts where id = src), 'another contact') end,
        'Message: ' || left(p_draft ->> 'text', 500)), 1000))
    returning id into oid;
  for it in select * from jsonb_array_elements(p_draft -> 'items') loop
    insert into order_items(workspace_id, order_id, product_id, quantity, unit_price)
      select p_workspace, oid, p.id, greatest(1, least(500, coalesce((it ->> 'qty')::int, 1))), p.price from products p where p.id = (it ->> 'product_id')::uuid;
  end loop;
  update contacts set tags = array_remove(tags, 'No order yet'), updated_at = now() where id = cid;
  return oid;
end $$;
revoke execute on function public.create_order_from_message(uuid, jsonb) from public, anon;
grant execute on function public.create_order_from_message(uuid, jsonb) to authenticated;
