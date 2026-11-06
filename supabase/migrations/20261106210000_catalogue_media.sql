-- Bizriva CRM — product variants and photos for the AI and the chat (2026-11-06).
--
-- Media library files live in the private chat-media bucket under
-- <workspace>/out/media/… (the team uploads there; only the team can read).
-- The AI sees each product's variants and whether it has a photo; when a
-- customer asks to see a product, the AI sends its first photo. Checkout
-- prices the exact variant (its own price and stock).

alter table public.media_assets add column name text check (length(name) <= 200);
-- A library file must sit in the business's own folder.
alter table public.media_assets add constraint media_assets_own_folder check (split_part(storage_path, '/', 1) = workspace_id::text) not valid;

-- The AI sends a product's photo into the chat (first image linked to the product).
create or replace function public.svc_ai_send_photo(p_conversation uuid, p_product text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations; p products; m media_assets; mid uuid; prev text;
begin
  select * into c from conversations where id = p_conversation;
  if c is null then return jsonb_build_object('ok', false, 'error', 'no_chat'); end if;
  select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
    and (lower(name) = lower(btrim(p_product)) or position(lower(btrim(p_product)) in lower(name)) > 0) order by (lower(name) = lower(btrim(p_product))) desc, length(name) limit 1;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'no_product'); end if;
  select * into m from media_assets where product_id = p.id and kind = 'image' and storage_path like c.workspace_id::text || '/out/%' order by created_at limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_photo', 'product', p.name); end if;
  prev := private.sys_on();
  insert into messages(workspace_id, conversation_id, direction, body, status, media_path, media_kind, media_name, by_ai)
    values (c.workspace_id, c.id, 'out', p.name || ' — ' || private.money(c.workspace_id, coalesce(p.promo_price, p.price)), 'queued', m.storage_path, 'image', coalesce(m.name, p.name), true)
    returning id into mid;
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true, 'message', mid, 'product', p.name);
end $$;
revoke execute on function public.svc_ai_send_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_ai_send_photo(uuid, text) to service_role;

-- Products in the AI's context now carry their variants and whether a photo exists.
create or replace function public.svc_ai_context(p_conversation uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', w.name, 'currency', w.currency,
    'deliveryFee', w.settings -> 'deliveryFee', 'freeDeliveryOver', w.settings -> 'freeDeliveryOver',
    'agent', coalesce(w.settings -> 'agent', '{}'::jsonb),
    'optOutKeywords', coalesce(w.settings -> 'optOutKeywords', '["STOP"]'::jsonb),
    'customer', jsonb_build_object('name', k.name, 'location', k.location, 'phone', k.phone, 'address', k.address),
    'checkout', case when c.checkout is not null and (c.checkout ->> 'summary_at')::timestamptz > now() - interval '24 hours' then c.checkout end,
    'products', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'price', p.price, 'promoPrice', p.promo_price, 'inStock', coalesce(p.stock, 1) > 0,
        'category', p.category, 'description', left(p.description, 400), 'benefits', left(p.benefits, 300),
        'hasPhoto', exists (select 1 from media_assets ma where ma.product_id = p.id and ma.kind = 'image'),
        'variants', coalesce((select jsonb_agg(jsonb_build_object('name', pv.name, 'price', coalesce(pv.price, p.price), 'inStock', coalesce(pv.stock, 1) > 0) order by pv.name)
                              from product_variants pv where pv.product_id = p.id), '[]'::jsonb)) order by p.name)
      from (select * from products where workspace_id = w.id and active and not restricted_category order by created_at desc limit 80) p), '[]'),
    'knowledge', coalesce((select jsonb_agg(jsonb_build_object('topic', e.topic, 'question', e.question, 'answer', left(e.answer, 800)))
      from (select * from knowledge_entries where workspace_id = w.id order by updated_at desc limit 60) e), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('ref', o.ref, 'status', o.status, 'total', o.total, 'paid', o.amount_paid, 'placed', o.created_at) order by o.created_at desc)
      from (select * from orders where contact_id = k.id order by created_at desc limit 5) o), '[]'),
    'facts', coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'value', f.value)) from contact_facts f where f.contact_id = k.id), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('from', case when m.direction = 'in' then 'customer' else 'business' end, 'text', left(m.body, 1500), 'at', m.created_at) order by m.created_at)
      from (select * from messages where conversation_id = c.id order by created_at desc limit 20) m), '[]')
  )
  from conversations c join workspaces w on w.id = c.workspace_id join contacts k on k.id = c.contact_id
  where c.id = p_conversation;
$$;

-- Checkout prices the exact variant when the product has variants.
create or replace function public.svc_ai_checkout_draft(p_conversation uuid, p_items jsonb, p_name text, p_phone text, p_address text, p_state text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations; w workspaces; k contacts; it jsonb; p products; pv product_variants; qty int; lines jsonb := '[]'; sub numeric := 0; fee numeric; free_over numeric;
  txt text := ''; missing text[] := '{}'; phone text; prev text; unknown text[] := '{}'; unit numeric; label text;
begin
  select * into c from conversations where id = p_conversation;
  if c is null then return jsonb_build_object('ok', false, 'error', 'Chat not found'); end if;
  select * into w from workspaces where id = c.workspace_id;
  select * into k from contacts where id = c.contact_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    p := null; pv := null;
    select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
      and (lower(name) = lower(btrim(it ->> 'product')) or lower(sku) = lower(btrim(it ->> 'product')))
      order by created_at limit 1;
    if p.id is null then
      select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
        and position(lower(btrim(it ->> 'product')) in lower(name)) > 0 order by length(name) limit 1;
    end if;
    if p.id is null then unknown := array_append(unknown, coalesce(it ->> 'product', '?')); continue; end if;
    if exists (select 1 from product_variants where product_id = p.id) then
      select * into pv from product_variants where product_id = p.id and lower(name) = lower(btrim(coalesce(it ->> 'variant', ''))) limit 1;
      if pv.id is null then missing := array_append(missing, 'which option of ' || p.name || ' (' || (select string_agg(name, ', ' order by name) from product_variants where product_id = p.id) || ')'); continue; end if;
      if coalesce(pv.stock, 1) <= 0 then unknown := array_append(unknown, p.name || ' — ' || pv.name || ' (out of stock)'); continue; end if;
      unit := coalesce(pv.price, p.promo_price, p.price); label := p.name || ' — ' || pv.name;
    else
      if coalesce(p.stock, 1) <= 0 then unknown := array_append(unknown, p.name || ' (out of stock)'); continue; end if;
      unit := coalesce(p.promo_price, p.price); label := p.name;
    end if;
    qty := greatest(1, least(coalesce(nullif(regexp_replace(coalesce(it ->> 'quantity', '1'), '\D', '', 'g'), '')::int, 1), 50));
    lines := lines || jsonb_build_object('product_id', p.id, 'variant_id', pv.id, 'name', label, 'qty', qty, 'price', unit);
    sub := sub + unit * qty;
  end loop;
  if cardinality(unknown) > 0 then return jsonb_build_object('ok', false, 'error', 'unknown_items', 'items', to_jsonb(unknown)); end if;
  if jsonb_array_length(lines) = 0 and cardinality(missing) = 0 then missing := array_append(missing, 'which product and how many'); end if;
  phone := coalesce(nullif(btrim(p_phone), ''), k.phone);
  if coalesce(btrim(coalesce(p_name, k.name)), '') = '' then missing := array_append(missing, 'full name'); end if;
  if length(private.phone_key(phone)) < 10 then missing := array_append(missing, 'phone number'); end if;
  if coalesce(btrim(coalesce(p_address, k.address)), '') = '' then missing := array_append(missing, 'delivery address'); end if;
  if cardinality(missing) > 0 then return jsonb_build_object('ok', false, 'error', 'missing', 'missing', to_jsonb(missing)); end if;
  fee := coalesce((w.settings ->> 'deliveryFee')::numeric, 0);
  free_over := nullif((w.settings ->> 'freeDeliveryOver')::numeric, 0);
  if free_over is not null and sub >= free_over then fee := 0; end if;
  select string_agg('• ' || (l ->> 'name') || case when (l ->> 'qty')::int > 1 then ' × ' || (l ->> 'qty') else '' end || ' — ' || private.money(w.id, (l ->> 'price')::numeric * (l ->> 'qty')::int), E'\n')
    into txt from jsonb_array_elements(lines) l;
  txt := E'Here is your order:\n' || txt
    || E'\nDelivery: ' || case when fee = 0 then 'free' else private.money(w.id, fee) end
    || E'\nTotal: ' || private.money(w.id, sub + fee) || ' — pay on delivery'
    || E'\n\nName: ' || btrim(coalesce(nullif(p_name, ''), k.name)) || E'\nPhone: ' || phone
    || E'\nAddress: ' || btrim(concat_ws(', ', nullif(btrim(coalesce(nullif(p_address, ''), k.address)), ''), nullif(btrim(p_state), '')))
    || E'\n\nReply YES to confirm, or tell me what to change.';
  prev := private.sys_on();
  update conversations set checkout = jsonb_build_object('lines', lines, 'subtotal', sub, 'fee', fee, 'total', sub + fee,
    'name', btrim(coalesce(nullif(p_name, ''), k.name)), 'phone', phone, 'address', btrim(coalesce(nullif(p_address, ''), k.address)), 'state', nullif(btrim(p_state), ''),
    'summary_at', now()) where id = c.id;
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true, 'summary', txt, 'total', sub + fee);
end $$;

-- Confirming keeps the variant on the order line.
create or replace function public.svc_ai_checkout_confirm(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations; d jsonb; cid uuid; oid uuid; l jsonb; prev text; v_ref text; lid uuid;
begin
  select * into c from conversations where id = p_conversation;
  d := c.checkout;
  if d is null or (d ->> 'summary_at')::timestamptz < now() - interval '24 hours' then return jsonb_build_object('ok', false, 'error', 'no_summary'); end if;
  prev := private.sys_on();
  cid := c.contact_id;
  update contacts set name = coalesce(nullif(d ->> 'name', ''), name), address = coalesce(nullif(d ->> 'address', ''), address),
    location = coalesce(nullif(d ->> 'state', ''), location), phone = coalesce(phone, case when length(private.phone_key(d ->> 'phone')) >= 10 then '+' || private.phone_key(d ->> 'phone') end), updated_at = now()
    where id = cid;
  select id into lid from leads where contact_id = cid order by created_at desc limit 1;
  insert into orders(workspace_id, contact_id, lead_id, conversation_id, status, payment_method, subtotal, delivery_fee, total, delivery_address, notes, channel)
    values (c.workspace_id, cid, lid, c.id, 'pending_verification', 'cod', (d ->> 'subtotal')::numeric, (d ->> 'fee')::numeric, (d ->> 'total')::numeric,
      left(concat_ws(', ', d ->> 'address', d ->> 'state'), 300), 'Placed in chat with the AI assistant', c.channel)
    returning id into oid;
  for l in select * from jsonb_array_elements(d -> 'lines') loop
    insert into order_items(workspace_id, order_id, product_id, variant_id, quantity, unit_price)
      values (c.workspace_id, oid, (l ->> 'product_id')::uuid, nullif(l ->> 'variant_id', '')::uuid, (l ->> 'qty')::int, (l ->> 'price')::numeric);
  end loop;
  update conversations set checkout = null where id = c.id;
  insert into activity_log(workspace_id, entity, entity_id, action, detail) values (c.workspace_id, 'order', oid, 'ai_checkout', jsonb_build_object('conversation', c.id));
  select o2.ref into v_ref from orders o2 where o2.id = oid;
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true, 'order_ref', v_ref, 'total', d ->> 'total');
end $$;
