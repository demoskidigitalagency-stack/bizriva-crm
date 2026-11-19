-- Buyer requests near you: on the seller directory a buyer posts what they want and their city
-- ("6ft snooker table, Kumasi, budget GH₵7,000"). Everyone sees the request without the phone number;
-- sellers listed in the directory see requests in their city or category with the buyer's WhatsApp
-- (the buyer agrees to that when posting). Requests close after 14 days.

create table if not exists public.buyer_requests (
  id uuid primary key default gen_random_uuid(),
  what text not null check (length(btrim(what)) between 3 and 200),
  city text check (length(city) <= 60),
  category text check (length(category) <= 60),
  budget text check (length(budget) <= 60),
  name text check (length(name) <= 80),
  phone text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  closed boolean not null default false
);
create index if not exists buyer_requests_open on public.buyer_requests (expires_at) where not closed;
alter table public.buyer_requests enable row level security;   -- read only through the functions below

create or replace function public.post_buyer_request(p_what text, p_city text, p_category text, p_budget text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if length(btrim(coalesce(p_what, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'Say what you want to buy'); end if;
  if length(private.phone_key(p_phone)) not between 10 and 15 then return jsonb_build_object('ok', false, 'error', 'Enter your WhatsApp number with country code'); end if;
  if not public.svc_rate_ok('req:' || private.phone_key(p_phone), 5, 86400) then return jsonb_build_object('ok', false, 'error', 'You''ve posted a few requests today — try again tomorrow'); end if;
  insert into buyer_requests(what, city, category, budget, name, phone)
    values (left(btrim(p_what), 200), nullif(left(btrim(p_city), 60), ''), nullif(left(btrim(p_category), 60), ''), nullif(left(btrim(p_budget), 60), ''), nullif(left(btrim(p_name), 80), ''), private.phone_key(p_phone));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.post_buyer_request(text, text, text, text, text, text) to anon, authenticated;

-- Public list (no phone numbers).
create or replace function public.public_buyer_requests(p_q text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('what', r.what, 'city', r.city, 'category', r.category, 'budget', r.budget, 'at', r.created_at) order by r.created_at desc), '[]')
  from (select * from buyer_requests where not closed and expires_at > now()
          and (p_q is null or p_q = '' or what ilike '%' || p_q || '%' or city ilike '%' || p_q || '%' or category ilike '%' || p_q || '%')
        order by created_at desc limit 50) r;
$$;
grant execute on function public.public_buyer_requests(text) to anon, authenticated;

-- A directory seller's matches: same city or category as their store, or naming one of their products.
create or replace function public.my_buyer_requests(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s store_pages;
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from store_pages where workspace_id = p_workspace and published and in_directory;
  if s.workspace_id is null then return jsonb_build_object('listed', false, 'requests', '[]'::jsonb); end if;
  return jsonb_build_object('listed', true, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'what', r.what, 'city', r.city, 'category', r.category, 'budget', r.budget, 'name', r.name, 'phone', r.phone, 'at', r.created_at) order by r.created_at desc)
    from buyer_requests r
    where not r.closed and r.expires_at > now()
      and ((s.city is not null and r.city ilike '%' || s.city || '%')
        or (s.category is not null and r.category ilike '%' || s.category || '%')
        or exists (select 1 from products p where p.workspace_id = p_workspace and p.active and length(p.name) >= 4
                   and (r.what ilike '%' || p.name || '%' or exists (select 1 from unnest(coalesce(p.aliases, '{}')) a where length(a) >= 4 and r.what ilike '%' || a || '%'))))
    limit 50), '[]'::jsonb));
end $$;
grant execute on function public.my_buyer_requests(uuid) to authenticated;
