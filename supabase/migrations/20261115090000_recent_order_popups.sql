-- Recent order pop-ups on order forms (FabianForms idea): "Someone in Kumasi ordered … 2 h ago".
-- Off by default, per form. Only real orders from the last 14 days; town and product only — no names or phones.
alter table public.order_forms add column if not exists show_recent boolean not null default false;
create or replace function public.svc_public_form(p_form uuid)
 returns jsonb language sql security definer set search_path to 'public' as $function$
  select jsonb_build_object('id', f.id, 'name', f.name, 'headline', f.headline, 'banner', f.banner, 'packages', f.packages,
    'fields', f.fields, 'pay_on_delivery', f.pay_on_delivery, 'thank_you', f.thank_you, 'business', w.name, 'currency', w.currency,
    'product', p.name, 'description', p.description,
    'recent', case when f.show_recent then coalesce((
      select jsonb_agg(jsonb_build_object('town', r.town, 'product', r.product, 'minutes', r.mins) order by r.mins)
      from (select nullif(btrim(coalesce(k.location, '')), '') town,
                   (select pp.name from order_items oi join products pp on pp.id = oi.product_id where oi.order_id = o.id limit 1) product,
                   greatest(1, round(extract(epoch from now() - o.created_at) / 60))::int mins
            from orders o join contacts k on k.id = o.contact_id
            where o.workspace_id = f.workspace_id and o.created_at > now() - interval '14 days'
              and o.status::text not in ('cancelled', 'refused', 'returned')
            order by o.created_at desc limit 6) r), '[]'::jsonb) else '[]'::jsonb end)
  from order_forms f join workspaces w on w.id = f.workspace_id join products p on p.id = f.product_id
  where f.id = p_form and f.active;
$function$;
