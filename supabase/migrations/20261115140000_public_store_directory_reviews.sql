-- A real public store page (bizriva-crm.vercel.app/s/<slug>), an opt-in seller directory
-- (/directory, by category and city) and real Google reviews on the store.
-- Reviews: the owner pastes reviews from their Google Business Profile with the review's Google
-- link; each one shows "on Google" and links back. No invented reviews: a Google link is required.
create table if not exists public.store_pages (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  published boolean not null default false,
  in_directory boolean not null default false,
  tagline text check (tagline is null or length(tagline) <= 200),
  category text check (category is null or length(category) <= 60),
  city text check (city is null or length(city) <= 60),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\d{7,15}$'),
  google_url text check (google_url is null or google_url ~ '^https://'),
  updated_at timestamptz not null default now()
);
create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author text not null check (length(btrim(author)) between 1 and 80),
  rating int not null check (rating between 1 and 5),
  body text not null check (length(btrim(body)) between 1 and 1500),
  source_url text not null check (source_url ~* '^https://([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|g\.page)/'),
  review_date date,
  shown boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.store_pages enable row level security;
alter table public.store_reviews enable row level security;
create policy "members read store page" on public.store_pages for select using (private.is_member(workspace_id));
create policy "owners edit store page" on public.store_pages for all using (private.has_role(workspace_id, array['owner','manager']::member_role[])) with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
create policy "members read reviews" on public.store_reviews for select using (private.is_member(workspace_id));
create policy "owners edit reviews" on public.store_reviews for all using (private.has_role(workspace_id, array['owner','manager']::member_role[])) with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
grant select, insert, update, delete on public.store_pages, public.store_reviews to authenticated;

-- Public: one published store with its active products and shown reviews.
create or replace function public.public_store(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', w.name, 'currency', w.currency, 'tagline', s.tagline, 'category', s.category, 'city', s.city, 'google_url', s.google_url,
    'whatsapp', coalesce((select l.phone from wa_links l where l.workspace_id = w.id and l.status = 'connected'), s.whatsapp),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'promo_price', p.promo_price, 'description', left(p.description, 400),
        'category', p.category, 'image', p.image_url, 'digital', p.digital_path is not null) order by p.category, p.name)
      from products p where p.workspace_id = w.id and p.active and not p.restricted_category), '[]'),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'headline', f.headline)) from order_forms f where f.workspace_id = w.id and f.active), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('author', r.author, 'rating', r.rating, 'body', r.body, 'url', r.source_url, 'date', r.review_date) order by r.review_date desc nulls last)
      from store_reviews r where r.workspace_id = w.id and r.shown), '[]'))
  from store_pages s join workspaces w on w.id = s.workspace_id
  where s.slug = lower(btrim(p_slug)) and s.published and w.suspended_at is null
$$;

-- Public: stores that chose to be listed.
create or replace function public.public_directory(p_category text default null, p_city text default null, p_q text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'name', w.name, 'tagline', s.tagline, 'category', s.category, 'city', s.city,
      'products', (select count(*) from products p where p.workspace_id = w.id and p.active),
      'rating', (select round(avg(r.rating), 1) from store_reviews r where r.workspace_id = w.id and r.shown),
      'reviews', (select count(*) from store_reviews r where r.workspace_id = w.id and r.shown)) order by w.name), '[]')
  from store_pages s join workspaces w on w.id = s.workspace_id
  where s.published and s.in_directory and w.suspended_at is null
    and (nullif(btrim(p_category), '') is null or s.category ilike btrim(p_category))
    and (nullif(btrim(p_city), '') is null or s.city ilike btrim(p_city))
    and (nullif(btrim(p_q), '') is null or w.name ilike '%' || btrim(p_q) || '%' or s.tagline ilike '%' || btrim(p_q) || '%'
         or exists (select 1 from products p where p.workspace_id = w.id and p.active and p.name ilike '%' || btrim(p_q) || '%'))
$$;
grant execute on function public.public_store(text) to anon, authenticated;
grant execute on function public.public_directory(text, text, text) to anon, authenticated;
