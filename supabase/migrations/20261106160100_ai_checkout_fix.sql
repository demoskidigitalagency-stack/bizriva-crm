-- Fix: adding to the missing/unknown lists (text arrays).
create or replace function public.svc_ai_checkout_draft(p_conversation uuid, p_items jsonb, p_name text, p_phone text, p_address text, p_state text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations; w workspaces; k contacts; it jsonb; p products; qty int; lines jsonb := '[]'; sub numeric := 0; fee numeric; free_over numeric;
  txt text := ''; missing text[] := '{}'; phone text; prev text; unknown text[] := '{}';
begin
  select * into c from conversations where id = p_conversation;
  if c is null then return jsonb_build_object('ok', false, 'error', 'Chat not found'); end if;
  select * into w from workspaces where id = c.workspace_id;
  select * into k from contacts where id = c.contact_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
      and (lower(name) = lower(btrim(it ->> 'product')) or lower(sku) = lower(btrim(it ->> 'product')))
      order by created_at limit 1;
    if p.id is null then
      select * into p from products where workspace_id = c.workspace_id and active and not restricted_category
        and position(lower(btrim(it ->> 'product')) in lower(name)) > 0 order by length(name) limit 1;
    end if;
    if p.id is null then unknown := array_append(unknown, coalesce(it ->> 'product', '?')); continue; end if;
    if coalesce(p.stock, 1) <= 0 then unknown := array_append(unknown, p.name || ' (out of stock)'); continue; end if;
    qty := greatest(1, least(coalesce(nullif(regexp_replace(coalesce(it ->> 'quantity', '1'), '\D', '', 'g'), '')::int, 1), 50));
    lines := lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'qty', qty, 'price', coalesce(p.promo_price, p.price));
    sub := sub + coalesce(p.promo_price, p.price) * qty;
  end loop;
  if cardinality(unknown) > 0 then return jsonb_build_object('ok', false, 'error', 'unknown_items', 'items', to_jsonb(unknown)); end if;
  if jsonb_array_length(lines) = 0 then missing := array_append(missing, 'which product and how many'); end if;
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
