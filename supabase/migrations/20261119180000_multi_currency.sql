-- Selling in more than one currency (e.g. naira in Nigeria, cedis in Ghana).
--
--   products.prices      extra prices by currency: {"NGN": 45000, "GHS": 3500}. The main price stays in
--                        products.price, in the business's own currency.
--   orders.currency      the currency of the order's amounts (null = the business's currency).
--   order_forms.currency the currency of the form's package prices (null = the business's currency).
--   workspaces.settings.deliveryFees  optional delivery fee per currency: {"GHS": 50}.
--
-- Which currency a customer gets: from their phone number (+234 naira, +233 cedis, +254 shillings…),
-- when the business sells in that currency (some product has a price in it); otherwise the business's
-- own currency. In a foreign currency, only products priced in it are offered or accepted. Reports keep
-- each currency's totals apart; nothing is converted.

alter table public.products add column if not exists prices jsonb not null default '{}'
  check (jsonb_typeof(prices) = 'object');
alter table public.orders add column if not exists currency text check (currency ~ '^[A-Z]{3}$');
alter table public.order_forms add column if not exists currency text check (currency ~ '^[A-Z]{3}$');

-- Currency for a phone number.
create or replace function private.phone_currency(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select case
    when k like '234%' then 'NGN' when k like '233%' then 'GHS' when k like '254%' then 'KES' when k like '256%' then 'UGX'
    when k like '255%' then 'TZS' when k like '27%' then 'ZAR' when k like '225%' or k like '221%' or k like '229%' or k like '228%' then 'XOF'
    when k like '237%' then 'XAF' when k like '44%' then 'GBP' when k like '1%' then 'USD' else null end
  from (select private.phone_key(p_phone) as k) x;
$$;

-- The currency this business sells to that phone in.
create or replace function private.sell_currency(p_workspace uuid, p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select case when c is not null and (c = w.currency or exists (select 1 from products p where p.workspace_id = w.id and p.prices ? c)) then c else w.currency end
  from workspaces w, (select private.phone_currency(p_phone) as c) x where w.id = p_workspace;
$$;

-- A product's selling price in a currency (promo price in the main currency); null when not sold in it.
create or replace function private.price_in(p products, p_currency text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_currency is null or p_currency = (select currency from workspaces where id = p.workspace_id) then coalesce(p.promo_price, p.price)
              else nullif(p.prices ->> p_currency, '')::numeric end;
$$;

create or replace function private.money_in(p_currency text, amount numeric) returns text
language sql immutable set search_path = '' as $$
  select case p_currency when 'NGN' then '₦' when 'GHS' then 'GH₵' when 'KES' then 'KSh ' when 'USD' then '$' when 'GBP' then '£' when 'ZAR' then 'R' else coalesce(p_currency, '') || ' ' end
         || to_char(round(amount), 'FM999,999,999,990');
$$;

-- Delivery fee in a currency: the main fee in the main currency, else settings.deliveryFees[currency], else 0.
create or replace function private.fee_in(w workspaces, p_currency text) returns numeric
language sql stable set search_path = public as $$
  select case when p_currency = w.currency then coalesce((w.settings ->> 'deliveryFee')::numeric, 0)
              else coalesce((w.settings -> 'deliveryFees' ->> p_currency)::numeric, 0) end;
$$;

-- AI assistant: prices in the customer's currency; products not sold in it are left out.
create or replace function public.svc_ai_context(p_conversation uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with base as (
    select c, w, k, private.sell_currency(w.id, k.phone) as cur
    from conversations c join workspaces w on w.id = c.workspace_id join contacts k on k.id = c.contact_id where c.id = p_conversation
  )
  select jsonb_build_object(
    'business', (w).name, 'currency', cur,
    'deliveryFee', case when cur = (w).currency then (w).settings -> 'deliveryFee' else (w).settings -> 'deliveryFees' -> cur end,
    'freeDeliveryOver', case when cur = (w).currency then (w).settings -> 'freeDeliveryOver' end,
    'agent', coalesce((w).settings -> 'agent', '{}'::jsonb),
    'optOutKeywords', coalesce((w).settings -> 'optOutKeywords', '["STOP"]'::jsonb),
    'customer', jsonb_build_object('name', (k).name, 'location', (k).location, 'phone', (k).phone, 'address', (k).address),
    'checkout', case when (c).checkout is not null and ((c).checkout ->> 'summary_at')::timestamptz > now() - interval '24 hours' then (c).checkout end,
    'products', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'price', private.price_in(p, cur),
        'promoPrice', case when cur = (w).currency then p.promo_price end, 'inStock', coalesce(p.stock, 1) > 0,
        'category', p.category, 'description', left(p.description, 400), 'benefits', left(p.benefits, 300),
        'hasPhoto', exists (select 1 from media_assets ma where ma.product_id = p.id and ma.kind = 'image'),
        'variants', coalesce((select jsonb_agg(jsonb_build_object('name', pv.name, 'price', case when cur = (w).currency then coalesce(pv.price, p.price) else private.price_in(p, cur) end, 'inStock', coalesce(pv.stock, 1) > 0) order by pv.name)
                              from product_variants pv where pv.product_id = p.id), '[]'::jsonb)) order by p.name)
      from (select * from products where workspace_id = (w).id and active and not restricted_category order by created_at desc limit 80) p
      where private.price_in(p, cur) is not null), '[]'),
    'knowledge', coalesce((select jsonb_agg(jsonb_build_object('topic', e.topic, 'question', e.question, 'answer', left(e.answer, 800)))
      from (select * from knowledge_entries where workspace_id = (w).id order by updated_at desc limit 60) e), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('ref', o.ref, 'status', o.status, 'total', o.total, 'paid', o.amount_paid, 'currency', coalesce(o.currency, (w).currency), 'placed', o.created_at) order by o.created_at desc)
      from (select * from orders where contact_id = (k).id order by created_at desc limit 5) o), '[]'),
    'facts', coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'value', f.value)) from contact_facts f where f.contact_id = (k).id), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('from', case when m.direction = 'in' then 'customer' else 'business' end, 'text', left(m.body, 1500), 'at', m.created_at) order by m.created_at)
      from (select * from messages where conversation_id = (c).id order by created_at desc limit 20) m), '[]')
  ) from base;
$$;

-- AI checkout summary in the customer's currency.
create or replace function public.svc_ai_checkout_draft(p_conversation uuid, p_items jsonb, p_name text, p_phone text, p_address text, p_state text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c conversations; w workspaces; k contacts; it jsonb; p products; pv product_variants; qty int; lines jsonb := '[]'; sub numeric := 0; fee numeric; free_over numeric;
  txt text := ''; missing text[] := '{}'; phone text; prev text; unknown text[] := '{}'; unit numeric; label text; cur text;
begin
  select * into c from conversations where id = p_conversation;
  if c is null then return jsonb_build_object('ok', false, 'error', 'Chat not found'); end if;
  select * into w from workspaces where id = c.workspace_id;
  select * into k from contacts where id = c.contact_id;
  cur := private.sell_currency(w.id, coalesce(k.phone, p_phone));
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    p := null; pv := null;
    select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
      and (lower(name) = lower(btrim(it ->> 'product')) or lower(sku) = lower(btrim(it ->> 'product')))
      order by created_at limit 1;
    if p.id is null then
      select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
        and position(lower(btrim(it ->> 'product')) in lower(name)) > 0 order by length(name) limit 1;
    end if;
    if p.id is null or private.price_in(p, cur) is null then unknown := array_append(unknown, coalesce(it ->> 'product', '?')); continue; end if;
    if exists (select 1 from product_variants where product_id = p.id) then
      select * into pv from product_variants where product_id = p.id and lower(name) = lower(btrim(coalesce(it ->> 'variant', ''))) limit 1;
      if pv.id is null then missing := array_append(missing, 'which option of ' || p.name || ' (' || (select string_agg(name, ', ' order by name) from product_variants where product_id = p.id) || ')'); continue; end if;
      if coalesce(pv.stock, 1) <= 0 then unknown := array_append(unknown, p.name || ' — ' || pv.name || ' (out of stock)'); continue; end if;
      unit := case when cur = w.currency then coalesce(pv.price, p.promo_price, p.price) else private.price_in(p, cur) end; label := p.name || ' — ' || pv.name;
    else
      if coalesce(p.stock, 1) <= 0 then unknown := array_append(unknown, p.name || ' (out of stock)'); continue; end if;
      unit := private.price_in(p, cur); label := p.name;
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
  fee := private.fee_in(w, cur);
  free_over := case when cur = w.currency then nullif((w.settings ->> 'freeDeliveryOver')::numeric, 0) end;
  if free_over is not null and sub >= free_over then fee := 0; end if;
  select string_agg('• ' || (l ->> 'name') || case when (l ->> 'qty')::int > 1 then ' × ' || (l ->> 'qty') else '' end || ' — ' || private.money_in(cur, (l ->> 'price')::numeric * (l ->> 'qty')::int), E'\n')
    into txt from jsonb_array_elements(lines) l;
  txt := E'Here is your order:\n' || txt
    || E'\nDelivery: ' || case when fee = 0 then 'free' else private.money_in(cur, fee) end
    || E'\nTotal: ' || private.money_in(cur, sub + fee) || ' — pay on delivery'
    || E'\n\nName: ' || btrim(coalesce(nullif(p_name, ''), k.name)) || E'\nPhone: ' || phone
    || E'\nAddress: ' || btrim(concat_ws(', ', nullif(btrim(coalesce(nullif(p_address, ''), k.address)), ''), nullif(btrim(p_state), '')))
    || E'\n\nReply YES to confirm, or tell me what to change.';
  prev := private.sys_on();
  update conversations set checkout = jsonb_build_object('lines', lines, 'subtotal', sub, 'fee', fee, 'total', sub + fee, 'currency', cur,
    'name', btrim(coalesce(nullif(p_name, ''), k.name)), 'phone', phone, 'address', btrim(coalesce(nullif(p_address, ''), k.address)), 'state', nullif(btrim(p_state), ''),
    'summary_at', now()) where id = c.id;
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true, 'summary', txt, 'total', sub + fee);
end $$;

create or replace function public.svc_ai_checkout_confirm(p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  insert into orders(workspace_id, contact_id, lead_id, conversation_id, status, payment_method, subtotal, delivery_fee, total, delivery_address, notes, channel, currency)
    values (c.workspace_id, cid, lid, c.id, 'pending_verification', 'cod', (d ->> 'subtotal')::numeric, (d ->> 'fee')::numeric, (d ->> 'total')::numeric,
      left(concat_ws(', ', d ->> 'address', d ->> 'state'), 300), 'Placed in chat with the AI assistant', c.channel,
      nullif(nullif(d ->> 'currency', ''), (select currency from workspaces where id = c.workspace_id)))
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

-- Order forms: the order is in the form's currency.
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
  select o.ref into existing from order_form_submissions s join orders o on o.id = s.order_id join contacts c on c.id = s.contact_id
    where s.form_id = f.id and s.created_at > now() - interval '15 minutes' and private.phone_key(c.phone) = private.phone_key(p_phone) limit 1;
  if existing is not null then return jsonb_build_object('status', 'duplicate', 'order_ref', existing, 'thank_you', f.thank_you); end if;
  prev := private.sys_on();
  cid := private.find_or_add_contact(f.workspace_id, p_name, p_phone, null, p_address, p_city, null);
  insert into leads(workspace_id, contact_id, source_channel, ad_campaign_name) values (f.workspace_id, cid, 'webchat', left(p_ad_source, 200)) returning id into lid;
  insert into orders(workspace_id, contact_id, lead_id, form_id, status, payment_method, subtotal, total, delivery_address, notes, currency)
    values (f.workspace_id, cid, lid, f.id, 'pending_verification', (case when f.pay_on_delivery then 'cod' else 'payment_link' end)::payment_method, price, price,
      left(concat_ws(', ', p_address, p_city), 300), left('Order form: ' || f.name || ' · ' || coalesce(pkg ->> 'label', ''), 500),
      nullif(f.currency, (select currency from workspaces where id = f.workspace_id)))
    returning id into oid;
  insert into order_items(workspace_id, order_id, product_id, quantity, unit_price) values (f.workspace_id, oid, f.product_id, qty, round(price / qty, 2));
  insert into order_form_submissions(workspace_id, form_id, order_id, contact_id, package_id, total, region, ad_source)
    values (f.workspace_id, f.id, oid, cid, p_package, price, left(p_region, 80), left(p_ad_source, 200));
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'created', 'order_ref', (select ref from orders where id = oid), 'thank_you', f.thank_you);
end $$;

-- "Make order" from a message: priced in the customer's currency (from their phone), or a currency the person picked.
create or replace function public.create_order_from_message(p_workspace uuid, p_draft jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; oid uuid; conv uuid; sub numeric := 0; fee numeric; dep numeric; it jsonb; pr products; n int := 0; cur text; main text; unit numeric;
  ph text := regexp_replace(coalesce(p_draft ->> 'phone', ''), '\D', '', 'g');
  src uuid := nullif(p_draft ->> 'from_contact', '')::uuid;
begin
  if not private.has_role(p_workspace, array['owner', 'manager', 'sales']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(p_draft -> 'items', '[]')) = 0 then raise exception 'Pick at least one product' using errcode = '22023'; end if;
  if length(ph) >= 9 then
    cid := private.find_or_add_contact(p_workspace, nullif(btrim(p_draft ->> 'name'), ''), '+' || ph, null, nullif(btrim(p_draft ->> 'address'), ''), nullif(btrim(p_draft ->> 'town'), ''), null);
  elsif src is not null and exists (select 1 from contacts where id = src and workspace_id = p_workspace) then
    cid := src;
  else
    raise exception 'Add the customer''s phone number' using errcode = '22023';
  end if;
  select currency into main from workspaces where id = p_workspace;
  cur := coalesce(nullif(p_draft ->> 'currency', ''), private.sell_currency(p_workspace, (select phone from contacts where id = cid)));
  for it in select * from jsonb_array_elements(p_draft -> 'items') loop
    select * into pr from products where id = (it ->> 'product_id')::uuid and workspace_id = p_workspace;
    if pr.id is null then raise exception 'Product not found' using errcode = '22023'; end if;
    unit := case when cur = main then pr.price else private.price_in(pr, cur) end;
    if unit is null then raise exception '% has no % price — add it on the Products page', pr.name, cur using errcode = '22023'; end if;
    sub := sub + unit * greatest(1, least(500, coalesce((it ->> 'qty')::int, 1)));
  end loop;
  fee := greatest(0, coalesce((p_draft ->> 'delivery_fee')::numeric, 0));
  dep := greatest(0, coalesce((p_draft ->> 'deposit')::numeric, 0));
  select id into conv from conversations where workspace_id = p_workspace and contact_id = coalesce(src, cid) order by created_at desc limit 1;
  insert into orders(workspace_id, contact_id, conversation_id, subtotal, discount, delivery_fee, total, payment_method, channel, delivery_address, notes, currency)
    values (p_workspace, cid, case when src is null or src = cid then conv end, sub, 0, fee, sub + fee,
      (case when dep > 0 then 'deposit' else 'cod' end)::payment_method, 'whatsapp',
      nullif(btrim(concat_ws(', ', p_draft ->> 'address', p_draft ->> 'town')), ''),
      left(concat_ws(E'\n', case when dep > 0 then 'Deposit mentioned in chat: ' || dep end,
        case when src is not null and src <> cid then 'From a message by ' || coalesce((select name from contacts where id = src), 'another contact') end,
        'Message: ' || left(p_draft ->> 'text', 500)), 1000), nullif(cur, main))
    returning id into oid;
  for it in select * from jsonb_array_elements(p_draft -> 'items') loop
    insert into order_items(workspace_id, order_id, product_id, quantity, unit_price)
      select p_workspace, oid, p.id, greatest(1, least(500, coalesce((it ->> 'qty')::int, 1))), case when cur = main then p.price else private.price_in(p, cur) end
      from products p where p.id = (it ->> 'product_id')::uuid;
  end loop;
  update contacts set tags = array_remove(tags, 'No order yet'), updated_at = now() where id = cid;
  return oid;
end $$;

-- Which currency the app should default to for a contact (order screens).
create or replace function public.contact_currency(p_workspace uuid, p_contact uuid) returns text
language sql stable security definer set search_path = public as $$
  select private.sell_currency(p_workspace, (select phone from contacts where id = p_contact and workspace_id = p_workspace))
  where private.is_member(p_workspace);
$$;
grant execute on function public.contact_currency(uuid, uuid) to authenticated;

-- Order form page, rider delivery page, payment links and ad-platform sales use the form's/order's currency.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.svc_public_form(uuid)'::regprocedure);
  execute replace(d, '''currency'', w.currency', '''currency'', coalesce(f.currency, w.currency)');
  d := pg_get_functiondef('public.svc_delivery_view(text)'::regprocedure);
  execute replace(d, '''currency'', w.currency', '''currency'', coalesce(o.currency, w.currency)');
  d := pg_get_functiondef('public.svc_payment_context(uuid, uuid)'::regprocedure);
  execute replace(d, '''currency'', w.currency', '''currency'', coalesce(o.currency, w.currency)');
  d := pg_get_functiondef('private.queue_conversions()'::regprocedure);
  execute replace(d, 'new.total, w.currency', 'new.total, coalesce(new.currency, w.currency)');
end $$;
