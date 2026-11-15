-- Accurate ad numbers: confirmed or delivered orders are sent back to Meta (Conversions API, with a
-- dataset/pixel ID and an access token from Events Manager — no app review needed) and to TikTok
-- (Events API, pixel code + access token). Customer phone/email/name are SHA-256 hashed by the
-- sender before they leave Bizriva. Tokens live in Vault; only the server reads them.
create table if not exists public.conversion_links (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in ('meta', 'tiktok')),
  pixel_id text not null check (pixel_id ~ '^[A-Za-z0-9_-]{5,40}$'),
  token_secret_id uuid not null,
  send_when text not null default 'delivered' check (send_when in ('confirmed', 'delivered')),
  enabled boolean not null default true,
  test_code text check (test_code is null or length(test_code) <= 40),
  last_sent_at timestamptz,
  last_error text,
  saved_by uuid,
  saved_at timestamptz not null default now(),
  primary key (workspace_id, platform)
);
alter table public.conversion_links enable row level security;
create policy "owners and managers see conversion links" on public.conversion_links for select
  using (private.has_role(workspace_id, array['owner','manager']::member_role[]));
grant select on public.conversion_links to authenticated;

create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in ('meta', 'tiktok')),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_id text not null,
  value numeric not null,
  currency text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (platform, order_id)
);
alter table public.conversion_events enable row level security;
create policy "members see sales sent to ad platforms" on public.conversion_events for select using (private.is_member(workspace_id));
grant select on public.conversion_events to authenticated;

create or replace function public.save_conversion_link(p_workspace uuid, p_platform text, p_pixel text, p_token text, p_when text, p_test_code text)
returns void language plpgsql security definer set search_path = public as $$
declare cur conversion_links;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect this' using errcode = '42501'; end if;
  if p_platform not in ('meta', 'tiktok') then raise exception 'Unknown platform'; end if;
  if coalesce(p_pixel, '') !~ '^[A-Za-z0-9_-]{5,40}$' then raise exception 'That pixel / dataset ID doesn''t look right'; end if;
  select * into cur from conversion_links where workspace_id = p_workspace and platform = p_platform;
  if cur.workspace_id is null then
    if length(coalesce(p_token, '')) < 20 then raise exception 'Paste the access token'; end if;
    insert into conversion_links(workspace_id, platform, pixel_id, token_secret_id, send_when, test_code, saved_by)
      values (p_workspace, p_platform, p_pixel, vault.create_secret(p_token, 'conv_' || p_platform || '_' || p_workspace), coalesce(nullif(p_when, ''), 'delivered'), nullif(btrim(p_test_code), ''), auth.uid());
  else
    if length(coalesce(p_token, '')) >= 20 then perform vault.update_secret(cur.token_secret_id, p_token); end if;
    update conversion_links set pixel_id = p_pixel, send_when = coalesce(nullif(p_when, ''), send_when), test_code = nullif(btrim(p_test_code), ''), enabled = true,
      last_error = null, saved_by = auth.uid(), saved_at = now() where workspace_id = p_workspace and platform = p_platform;
  end if;
end $$;
create or replace function public.remove_conversion_link(p_workspace uuid, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare cur conversion_links;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect this' using errcode = '42501'; end if;
  select * into cur from conversion_links where workspace_id = p_workspace and platform = p_platform;
  if cur.workspace_id is null then return; end if;
  perform vault.update_secret(cur.token_secret_id, '');
  update conversion_links set enabled = false where workspace_id = p_workspace and platform = p_platform;
end $$;
revoke execute on function public.save_conversion_link(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.remove_conversion_link(uuid, text) from public, anon;
grant execute on function public.save_conversion_link(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.remove_conversion_link(uuid, text) to authenticated;

-- Queue a Purchase per order per platform when it reaches the chosen status.
create or replace function private.queue_conversions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  insert into conversion_events(workspace_id, platform, order_id, event_id, value, currency)
    select new.workspace_id, l.platform, new.id, 'bz_' || coalesce(new.ref, new.id::text), new.total, w.currency
    from conversion_links l join workspaces w on w.id = l.workspace_id
    where l.workspace_id = new.workspace_id and l.enabled and l.send_when = new.status::text
    on conflict (platform, order_id) do nothing;
  return null;
end $$;
drop trigger if exists queue_conversions on public.orders;
create trigger queue_conversions after update of status on public.orders for each row execute function private.queue_conversions();

-- Sender (Edge Function conversions-send, every minute while something is queued).
create or replace function public.svc_conversions_claim(p_limit int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  with picked as (
    select e.id from conversion_events e where e.status = 'queued' and e.attempts < 5 and (e.claimed_at is null or e.claimed_at < now() - interval '10 minutes')
    order by e.created_at limit least(greatest(p_limit, 1), 100) for update skip locked
  ), upd as (
    update conversion_events e set claimed_at = now(), attempts = e.attempts + 1 from picked where e.id = picked.id returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'platform', u.platform, 'event_id', u.event_id, 'value', u.value, 'currency', u.currency,
      'at', extract(epoch from coalesce(o.created_at, now()))::bigint, 'pixel', l.pixel_id, 'token', nullif(s.decrypted_secret, ''), 'test_code', l.test_code,
      'phone', regexp_replace(coalesce(k.phone, ''), '\D', '', 'g'), 'email', lower(btrim(coalesce(k.email, ''))), 'name', coalesce(k.name, ''), 'city', coalesce(k.location, ''),
      'ad_id', ld.ad_id, 'contents', (select coalesce(jsonb_agg(jsonb_build_object('id', oi.product_id, 'quantity', oi.quantity, 'price', oi.unit_price, 'name', p.name)), '[]') from order_items oi join products p on p.id = oi.product_id where oi.order_id = o.id))), '[]')
    into out
  from upd u join orders o on o.id = u.order_id join contacts k on k.id = o.contact_id
  join conversion_links l on l.workspace_id = u.workspace_id and l.platform = u.platform
  left join vault.decrypted_secrets s on s.id = l.token_secret_id
  left join leads ld on ld.id = o.lead_id;
  return out;
end $$;
create or replace function public.svc_conversions_result(p_id uuid, p_ok boolean, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare e conversion_events;
begin
  update conversion_events set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
    sent_at = case when p_ok then now() end, error = left(p_error, 500) where id = p_id returning * into e;
  update conversion_links set last_sent_at = case when p_ok then now() else last_sent_at end, last_error = case when p_ok then null else left(p_error, 300) end
    where workspace_id = e.workspace_id and platform = e.platform;
end $$;
revoke execute on function public.svc_conversions_claim(int) from public, anon, authenticated;
revoke execute on function public.svc_conversions_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.svc_conversions_claim(int) to service_role;
grant execute on function public.svc_conversions_result(uuid, boolean, text) to service_role;

select cron.schedule('bizriva-conversions-send', '* * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/conversions-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.conversion_events where status = 'queued')
$job$);
