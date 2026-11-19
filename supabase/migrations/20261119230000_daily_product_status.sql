-- Daily product Status (daily adverts): once a day, at the hour the owner picks, the next product with a
-- photo in the Media Library is posted to WhatsApp Status with its name and price, so the catalogue
-- rotates on its own. Settings live in workspaces.settings.dailyStatus = {on, hour, caption}.
alter table public.products add column if not exists last_featured_at timestamptz;
alter table public.wa_posts add column if not exists auto text check (auto in ('daily_product'));

create or replace function private.daily_product_status() returns int
language plpgsql security definer set search_path = public as $$
declare w workspaces; p products; m media_assets; cfg jsonb; tz text; n int := 0; cap text; prev text;
begin
  prev := private.sys_on();
  for w in select * from workspaces where (settings -> 'dailyStatus' ->> 'on')::boolean is true loop
    cfg := w.settings -> 'dailyStatus'; tz := coalesce(w.timezone, 'Africa/Lagos');
    continue when extract(hour from now() at time zone tz)::int <> coalesce((cfg ->> 'hour')::int, 10);
    continue when not exists (select 1 from wa_links l where l.workspace_id = w.id and l.status = 'connected');
    continue when exists (select 1 from wa_posts x where x.workspace_id = w.id and x.auto = 'daily_product' and x.created_at > now() - interval '20 hours');
    select pr.* into p from products pr
      where pr.workspace_id = w.id and pr.active and not pr.restricted_category
        and exists (select 1 from media_assets ma where ma.product_id = pr.id and ma.kind = 'image')
      order by pr.last_featured_at nulls first, pr.created_at limit 1;
    continue when p.id is null;
    select * into m from media_assets where product_id = p.id and kind = 'image' order by created_at limit 1;
    cap := replace(replace(coalesce(nullif(cfg ->> 'caption', ''), E'{name} — {price}\nReply to this Status to order 👇'),
      '{name}', p.name), '{price}', private.money_fmt(w.id, coalesce(p.promo_price, p.price)));
    insert into wa_posts(workspace_id, kind, body, media_path, media_kind, audience, scheduled_for, repeat, auto)
      values (w.id, 'status', left(cap, 700), m.storage_path, 'image', '{"who": "all"}', now(), 'none', 'daily_product');
    update products set last_featured_at = now() where id = p.id;
    n := n + 1;
  end loop;
  perform private.sys_restore(prev);
  return n;
end $$;
revoke execute on function private.daily_product_status() from public, anon, authenticated;

select cron.schedule('bizriva-daily-product-status', '5 * * * *', $job$ select private.daily_product_status() $job$);
