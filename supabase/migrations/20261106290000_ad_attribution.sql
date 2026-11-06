-- Bizriva CRM — which ads bring real (delivered) sales (2026-11-06).
--
-- A customer is credited to the ad that first brought them:
--   • click-to-WhatsApp / Messenger ads (Meta sends the ad id with the first message),
--   • Facebook/Instagram instant-form leads (already carry the ad id).
-- Their orders count for that ad. Spend comes from the business's Meta ad
-- account every few hours (meta-ads-sync, using the Meta link in Ads).
-- ad_performance() reports per ad and campaign: chats/leads, orders, delivered
-- orders, delivered revenue, spend, ROAS (delivered revenue ÷ spend) and cost
-- per delivered order — counted on delivery, because with pay on delivery an
-- order isn't money until it's delivered.

alter table public.leads add column ad_headline text, add column ad_source_url text, add column ad_attributed_at timestamptz;

create table public.ad_spend (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null,
  ad_id text not null,
  ad_name text, adset_id text, adset_name text, campaign_id text, campaign_name text,
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  currency text,
  synced_at timestamptz not null default now(),
  primary key (workspace_id, day, ad_id)
);
alter table public.ad_spend enable row level security;
create policy "team sees ad spend" on public.ad_spend for select using (private.is_member(workspace_id));

-- First touch: credit the customer's lead to the ad (once).
create or replace function public.svc_attribute_ad(p_workspace uuid, p_contact uuid, p_ad_id text, p_headline text, p_url text, p_channel text) returns void
language plpgsql security definer set search_path = public as $$
declare l leads; prev text;
begin
  if coalesce(p_ad_id, '') !~ '^\d{5,30}$' then return; end if;
  prev := private.sys_on();
  select * into l from leads where workspace_id = p_workspace and contact_id = p_contact order by created_at desc limit 1;
  if l.id is null then
    insert into leads(workspace_id, contact_id, source_channel, ad_id, ad_headline, ad_source_url, ad_attributed_at)
      values (p_workspace, p_contact, coalesce(nullif(p_channel, '')::channel, 'whatsapp'), p_ad_id, left(p_headline, 200), left(p_url, 500), now());
  elsif l.ad_id is null then
    update leads set ad_id = p_ad_id, ad_headline = left(p_headline, 200), ad_source_url = left(p_url, 500), ad_attributed_at = now() where id = l.id;
  end if;
  perform private.sys_restore(prev);
end $$;
revoke execute on function public.svc_attribute_ad(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.svc_attribute_ad(uuid, uuid, text, text, text, text) to service_role;

-- Spend rows from Meta (the sync function).
create or replace function public.svc_ad_spend_upsert(p_workspace uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into ad_spend(workspace_id, day, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, impressions, clicks, currency, synced_at)
  select p_workspace, (r ->> 'date_start')::date, r ->> 'ad_id', r ->> 'ad_name', r ->> 'adset_id', r ->> 'adset_name', r ->> 'campaign_id', r ->> 'campaign_name',
         coalesce((r ->> 'spend')::numeric, 0), coalesce((r ->> 'impressions')::bigint, 0), coalesce((r ->> 'clicks')::bigint, 0), r ->> 'account_currency', now()
  from jsonb_array_elements(coalesce(p_rows, '[]')) r where coalesce(r ->> 'ad_id', '') <> '' and r ->> 'date_start' is not null
  on conflict (workspace_id, day, ad_id) do update set ad_name = excluded.ad_name, adset_id = excluded.adset_id, adset_name = excluded.adset_name,
    campaign_id = excluded.campaign_id, campaign_name = excluded.campaign_name, spend = excluded.spend, impressions = excluded.impressions,
    clicks = excluded.clicks, currency = excluded.currency, synced_at = now();
  get diagnostics n = row_count;
  update meta_links set last_sync_at = now() where workspace_id = p_workspace;
  return n;
end $$;

create or replace function public.svc_ad_accounts() returns table(workspace_id uuid, ad_account_id text, token text)
language sql stable security definer set search_path = public as $$
  select m.workspace_id, m.ad_account_id, s.decrypted_secret from meta_links m join vault.decrypted_secrets s on s.id = m.token_secret_id
  where coalesce(s.decrypted_secret, '') <> '' and private.plan_active(m.workspace_id);
$$;
do $$
declare f text;
begin
  foreach f in array array['svc_ad_spend_upsert(uuid, jsonb)', 'svc_ad_accounts()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Results per ad (and its campaign) for a date range, counted on the day the customer first came.
create or replace function public.ad_performance(p_workspace uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with lead_ads as (
    select distinct on (l.contact_id) l.contact_id, l.ad_id, l.created_at from leads l
    where l.workspace_id = p_workspace and l.ad_id is not null order by l.contact_id, l.created_at
  ), people as (
    select ad_id, count(*) n from lead_ads where created_at::date between p_from and p_to group by ad_id
  ), sales as (
    select la.ad_id, count(o.*) orders, count(o.*) filter (where o.status = 'delivered') delivered,
      coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) revenue,
      count(o.*) filter (where o.status in ('cancelled', 'refused', 'returned')) lost
    from lead_ads la join orders o on o.contact_id = la.contact_id and o.created_at >= la.created_at
    where o.workspace_id = p_workspace and o.created_at::date between p_from and p_to group by la.ad_id
  ), spend as (
    select ad_id, max(ad_name) ad_name, max(campaign_id) campaign_id, max(campaign_name) campaign_name, sum(spend) spend, sum(clicks) clicks, max(currency) currency
    from ad_spend where workspace_id = p_workspace and day between p_from and p_to group by ad_id
  ), ads as (
    select coalesce(p.ad_id, s.ad_id, sp.ad_id) ad_id from people p full join sales s on s.ad_id = p.ad_id full join spend sp on sp.ad_id = coalesce(p.ad_id, s.ad_id)
  )
  select case when not private.is_member(p_workspace) then null else jsonb_build_object(
    'from', p_from, 'to', p_to,
    'currency', (select max(currency) from ad_spend where workspace_id = p_workspace),
    'lastSync', (select last_sync_at from meta_links where workspace_id = p_workspace),
    'ads', coalesce((select jsonb_agg(jsonb_build_object(
        'adId', a.ad_id, 'ad', coalesce(sp.ad_name, (select max(ad_headline) from leads where workspace_id = p_workspace and ad_id = a.ad_id), 'Ad ' || a.ad_id),
        'campaignId', sp.campaign_id, 'campaign', sp.campaign_name,
        'people', coalesce(p.n, 0), 'orders', coalesce(s.orders, 0), 'delivered', coalesce(s.delivered, 0), 'lost', coalesce(s.lost, 0),
        'revenue', coalesce(s.revenue, 0), 'spend', coalesce(sp.spend, 0), 'clicks', coalesce(sp.clicks, 0),
        'roas', case when coalesce(sp.spend, 0) > 0 then round(coalesce(s.revenue, 0) / sp.spend, 2) end,
        'costPerDelivered', case when coalesce(s.delivered, 0) > 0 and coalesce(sp.spend, 0) > 0 then round(sp.spend / s.delivered, 2) end)
      order by coalesce(s.revenue, 0) desc, coalesce(sp.spend, 0) desc)
      from (select distinct ad_id from ads where ad_id is not null) a
      left join people p on p.ad_id = a.ad_id left join sales s on s.ad_id = a.ad_id left join spend sp on sp.ad_id = a.ad_id), '[]'::jsonb),
    'unattributed', jsonb_build_object(
      'orders', (select count(*) from orders o where o.workspace_id = p_workspace and o.created_at::date between p_from and p_to and not exists (select 1 from lead_ads la where la.contact_id = o.contact_id)),
      'delivered', (select count(*) from orders o where o.workspace_id = p_workspace and o.status = 'delivered' and o.created_at::date between p_from and p_to and not exists (select 1 from lead_ads la where la.contact_id = o.contact_id))))
  end;
$$;
grant execute on function public.ad_performance(uuid, date, date) to authenticated;

select cron.schedule('bizriva-meta-ads-sync', '17 */4 * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.meta_links)
$job$);
