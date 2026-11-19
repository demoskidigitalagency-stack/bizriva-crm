-- Booking: customers pick a service and a free time on the business's booking page (/b/<store address>);
-- the booking lands in Bizriva (Calendar + the customer's record) and a WhatsApp confirmation is sent
-- from the linked number. Hours, days and services are set on the Store page.

alter table public.store_pages add column if not exists booking_on boolean not null default false;
alter table public.store_pages add column if not exists booking_hours jsonb not null default '{"days":[1,2,3,4,5,6],"start":"09:00","end":"17:00","notice_hours":2,"days_ahead":14}';

alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check check (kind in ('callback', 'delivery', 'meeting', 'reminder', 'booking'));

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  minutes int not null default 60 check (minutes between 10 and 600),
  price numeric check (price >= 0),
  description text check (length(description) <= 400),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.booking_services enable row level security;
create policy "members see services" on public.booking_services for select using (private.is_member(workspace_id));
create policy "owners and managers edit services" on public.booking_services for all
  using (private.has_role(workspace_id, array['owner','manager']::member_role[])) with check (private.has_role(workspace_id, array['owner','manager']::member_role[]));
grant select, insert, update, delete on public.booking_services to authenticated;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_id uuid references public.booking_services(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'done', 'cancelled', 'no_show')),
  name text, phone text, note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists bookings_ws_time on public.bookings (workspace_id, starts_at);
alter table public.bookings enable row level security;
create policy "members see bookings" on public.bookings for select using (private.is_member(workspace_id));
create policy "members update bookings" on public.bookings for update using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
grant select, update on public.bookings to authenticated;

-- The public booking page: business, services, hours (only when booking is switched on).
create or replace function public.public_booking(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', w.name, 'currency', w.currency, 'timezone', coalesce(w.timezone, 'Africa/Lagos'), 'hours', s.booking_hours,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'minutes', b.minutes, 'price', b.price, 'description', b.description) order by b.name)
                          from booking_services b where b.workspace_id = w.id and b.active), '[]'))
  from store_pages s join workspaces w on w.id = s.workspace_id where s.slug = lower(p_slug) and s.booking_on;
$$;
grant execute on function public.public_booking(text) to anon, authenticated;

-- Free start times for a service on a day (local time strings "HH:MM").
create or replace function public.booking_slots(p_slug text, p_service uuid, p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s store_pages; w workspaces; svc booking_services; h jsonb; tz text; t timestamptz; t_end timestamptz; last timestamptz; out jsonb := '[]';
begin
  select * into s from store_pages where slug = lower(p_slug) and booking_on;
  if s.workspace_id is null then return '[]'; end if;
  select * into w from workspaces where id = s.workspace_id;
  select * into svc from booking_services where id = p_service and workspace_id = s.workspace_id and active;
  if svc.id is null then return '[]'; end if;
  h := s.booking_hours; tz := coalesce(w.timezone, 'Africa/Lagos');
  if not (extract(isodow from p_day)::int in (select jsonb_array_elements_text(coalesce(h -> 'days', '[1,2,3,4,5,6]'))::int)) then return '[]'; end if;
  if p_day > (now() at time zone tz)::date + coalesce((h ->> 'days_ahead')::int, 14) then return '[]'; end if;
  t := (p_day + coalesce(h ->> 'start', '09:00')::time) at time zone tz;
  last := (p_day + coalesce(h ->> 'end', '17:00')::time) at time zone tz;
  while t + make_interval(mins => svc.minutes) <= last loop
    t_end := t + make_interval(mins => svc.minutes);
    if t >= now() + make_interval(hours => coalesce((h ->> 'notice_hours')::int, 2))
       and not exists (select 1 from bookings b where b.workspace_id = s.workspace_id and b.status = 'booked' and b.starts_at < t_end and b.ends_at > t) then
      out := out || to_jsonb(to_char(t at time zone tz, 'HH24:MI'));
    end if;
    t := t + make_interval(mins => least(svc.minutes, 30));
  end loop;
  return out;
end $$;
grant execute on function public.booking_slots(text, uuid, date) to anon, authenticated;

-- Book a time: re-checks the slot, saves the customer, adds it to the calendar, sends a WhatsApp confirmation.
create or replace function public.book_slot(p_slug text, p_service uuid, p_day date, p_time text, p_name text, p_phone text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s store_pages; w workspaces; svc booking_services; tz text; t timestamptz; cid uuid; bid uuid; conv uuid; prev text; msg text;
begin
  select * into s from store_pages where slug = lower(p_slug) and booking_on;
  if s.workspace_id is null then return jsonb_build_object('ok', false, 'error', 'Booking is closed'); end if;
  if coalesce(btrim(p_name), '') = '' then return jsonb_build_object('ok', false, 'error', 'Enter your name'); end if;
  if length(private.phone_key(p_phone)) not between 10 and 15 then return jsonb_build_object('ok', false, 'error', 'Enter your WhatsApp number with country code, e.g. +233…'); end if;
  if not public.svc_rate_ok('book:' || private.phone_key(p_phone), 5, 3600) then return jsonb_build_object('ok', false, 'error', 'Too many bookings — try again later'); end if;
  if not (to_jsonb(p_time) <@ public.booking_slots(p_slug, p_service, p_day)) then return jsonb_build_object('ok', false, 'error', 'That time was just taken — pick another'); end if;
  select * into w from workspaces where id = s.workspace_id;
  select * into svc from booking_services where id = p_service;
  tz := coalesce(w.timezone, 'Africa/Lagos');
  t := (p_day + p_time::time) at time zone tz;
  prev := private.sys_on();
  cid := private.find_or_add_contact(w.id, btrim(p_name), p_phone, null, null, null, null);
  insert into bookings(workspace_id, service_id, contact_id, starts_at, ends_at, name, phone, note)
    values (w.id, svc.id, cid, t, t + make_interval(mins => svc.minutes), left(btrim(p_name), 80), p_phone, left(p_note, 500)) returning id into bid;
  insert into calendar_events(workspace_id, title, kind, starts_at, contact_id, note)
    values (w.id, svc.name || ' — ' || left(btrim(p_name), 60), 'booking', t, cid, nullif(left(p_note, 500), ''));
  msg := format(E'Hi %s, your booking with %s is confirmed ✅\n%s\n%s at %s\n\nReply here if you need to change it.',
    split_part(btrim(p_name), ' ', 1), w.name, svc.name, to_char(t at time zone tz, 'Dy DD Mon'), to_char(t at time zone tz, 'HH24:MI'));
  if exists (select 1 from wa_links l where l.workspace_id = w.id and l.status = 'connected') then
    conv := private.wa_conversation(w.id, cid);
    insert into messages(workspace_id, conversation_id, direction, body, status, purpose) values (w.id, conv, 'out', msg, 'queued', 'service');
  end if;
  insert into activity_log(workspace_id, entity, entity_id, action, detail) values (w.id, 'contact', cid, 'booking_made', jsonb_build_object('service', svc.name, 'at', t));
  perform private.sys_restore(prev);
  return jsonb_build_object('ok', true, 'when', to_char(t at time zone tz, 'Dy DD Mon, HH24:MI'), 'service', svc.name);
end $$;
grant execute on function public.book_slot(text, uuid, date, text, text, text, text) to anon, authenticated;
