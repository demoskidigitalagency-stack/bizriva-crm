-- Bizriva CRM — plans and limits, paying for a plan, and the Super Admin console (2026-11-06).
--
-- Plans (prices in naira per month; changeable by a Super Admin):
--   trial   free, 14 days · 500 contacts · 3 seats · 1,000 broadcast/follow-up messages · 200 MB
--   starter ₦25,000 · 2,000 · 3 · 5,000 · 1 GB
--   growth  ₦60,000 · 10,000 · 10 · 25,000 · 5 GB
--   scale   ₦150,000 · 50,000 · 30 · 100,000 · 20 GB
-- What a limit stops (and what it never stops):
--   • contacts — staff adding or importing customers; customers who message you are ALWAYS saved;
--   • seats — inviting or adding teammates;
--   • messages — sending a broadcast that would go over the month's allowance;
--     replies, order updates and the AI are never counted or blocked;
--   • storage — uploading to the media library.
-- When a trial ends (or a paid plan lapses 3 days past its renewal) the AI
-- assistant and broadcasts pause until a plan is paid; everything else keeps working.
-- A suspended business (Super Admin) is paused the same way.

create table public.plans (
  id text primary key check (id in ('trial', 'starter', 'growth', 'scale')),
  name text not null,
  price_ngn numeric(14,2) not null default 0,
  contacts int not null, seats int not null, messages_month int not null, storage_mb int not null,
  sort int not null default 0
);
insert into public.plans(id, name, price_ngn, contacts, seats, messages_month, storage_mb, sort) values
  ('trial', 'Trial', 0, 500, 3, 1000, 200, 0),
  ('starter', 'Starter', 25000, 2000, 3, 5000, 1000, 1),
  ('growth', 'Growth', 60000, 10000, 10, 25000, 5000, 2),
  ('scale', 'Scale', 150000, 50000, 30, 100000, 20000, 3)
on conflict (id) do nothing;
alter table public.plans enable row level security;
create policy "anyone signed in sees the plans" on public.plans for select using (auth.uid() is not null);

alter table public.workspaces
  add column trial_ends_at timestamptz,
  add column plan_renews_at timestamptz,
  add column suspended_at timestamptz,
  add column suspended_reason text;
update public.workspaces set trial_ends_at = created_at + interval '14 days' where trial_ends_at is null;
alter table public.workspaces alter column trial_ends_at set default now() + interval '14 days';

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;   -- service only

create table public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan text not null references public.plans(id),
  amount numeric(14,2) not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.plan_payments enable row level security;
create policy "owners see their plan payments" on public.plan_payments for select using (private.has_role(workspace_id, array['owner','finance']::member_role[]));

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Is the business paid up (or still in trial) and not suspended?
create or replace function private.plan_active(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select w.suspended_at is null and case
    when w.plan = 'trial' then coalesce(w.trial_ends_at, 'infinity') > now()
    else coalesce(w.plan_renews_at, 'infinity') + interval '3 days' > now() end
  from workspaces w where w.id = ws;
$$;

create or replace function private.plan_limits(ws uuid) returns plans
language sql stable security definer set search_path = public as $$
  select p.* from workspaces w join plans p on p.id = w.plan where w.id = ws;
$$;

-- Broadcast and follow-up messages sent this calendar month (Lagos time).
create or replace function private.marketing_used(ws uuid) returns int
language sql stable security definer set search_path = public as $$
  select ((select count(*) from campaign_recipients r join messages m on m.id = r.message_id
          where r.workspace_id = ws and m.created_at >= date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
       + (select count(*) from followup_jobs j where j.workspace_id = ws and j.state = 'sent'
          and j.sent_at >= date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int;
$$;

create or replace function public.plan_usage(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when private.is_member(p_workspace) or private.is_platform_admin() then jsonb_build_object(
    'plan', w.plan, 'name', p.name, 'price', p.price_ngn,
    'trialEndsAt', w.trial_ends_at, 'renewsAt', w.plan_renews_at, 'active', private.plan_active(w.id),
    'suspended', w.suspended_at is not null, 'suspendedReason', w.suspended_reason,
    'limits', jsonb_build_object('contacts', p.contacts, 'seats', p.seats, 'messages', p.messages_month, 'storageMb', p.storage_mb),
    'used', jsonb_build_object(
      'contacts', (select count(*) from contacts c where c.workspace_id = w.id),
      'seats', (select count(*) from workspace_members m where m.workspace_id = w.id) + (select count(*) from workspace_invites i where i.workspace_id = w.id and i.accepted_at is null and i.expires_at > now()),
      'messages', private.marketing_used(w.id),
      'storageMb', round(coalesce((select sum(bytes) from media_assets a where a.workspace_id = w.id), 0) / 1048576.0, 1)))
  end
  from workspaces w join plans p on p.id = w.plan where w.id = p_workspace;
$$;
grant execute on function public.plan_usage(uuid) to authenticated;

-- ───── the limits ─────
create or replace function private.limit_contacts() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int;
begin
  if private.is_system() then return new; end if;   -- customers who write to you are always saved
  lim := (private.plan_limits(new.workspace_id)).contacts;
  if (select count(*) from contacts where workspace_id = new.workspace_id) >= lim then
    raise exception 'Your plan''s limit of % customers is reached — upgrade in Billing to add more. Customers who message you are still saved.', lim using errcode = '53400';
  end if;
  return new;
end $$;
create trigger limit_contacts before insert on public.contacts for each row execute function private.limit_contacts();

create or replace function private.limit_seats() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if tg_table_name = 'workspace_members' and exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = new.user_id) then return new; end if;
  lim := (private.plan_limits(new.workspace_id)).seats;
  used := (select count(*) from workspace_members where workspace_id = new.workspace_id)
        + case when tg_table_name = 'workspace_invites' then (select count(*) from workspace_invites i where i.workspace_id = new.workspace_id and i.accepted_at is null and i.expires_at > now()) else 0 end;
  if lim is not null and used >= lim then
    raise exception 'Your plan has % team seats and they''re all used — upgrade in Billing to add someone.', lim using errcode = '53400';
  end if;
  return new;
end $$;
create trigger limit_seats before insert on public.workspace_members for each row execute function private.limit_seats();
create trigger limit_seats before insert on public.workspace_invites for each row execute function private.limit_seats();

create or replace function private.limit_storage() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int;
begin
  lim := (private.plan_limits(new.workspace_id)).storage_mb;
  if coalesce((select sum(bytes) from media_assets where workspace_id = new.workspace_id), 0) + coalesce(new.bytes, 0) > lim::bigint * 1048576 then
    raise exception 'Your plan''s % MB of media storage is full — remove old files or upgrade in Billing.', lim using errcode = '53400';
  end if;
  return new;
end $$;
create trigger limit_storage before insert on public.media_assets for each row execute function private.limit_storage();

-- A broadcast can only be sent if it fits in this month's allowance (and the business is active).
create or replace function private.limit_broadcast() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; audience int; used int;
begin
  if new.status <> 'scheduled' or old.status = 'scheduled' then return new; end if;
  if not private.plan_active(new.workspace_id) then
    raise exception 'Your trial or plan has ended — pay for a plan in Billing to send broadcasts.' using errcode = '53400';
  end if;
  lim := (private.plan_limits(new.workspace_id)).messages_month;
  used := private.marketing_used(new.workspace_id);
  if new.channel = 'whatsapp' then
    select count(*) into audience from contacts ct where ct.workspace_id = new.workspace_id and length(private.phone_key(ct.phone)) >= 10
      and (select s.granted from consents s where s.contact_id = ct.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is true;
    if used + audience > lim then
      raise exception 'This broadcast would reach % customers, but only % of your plan''s % messages this month are left — upgrade in Billing.', audience, greatest(lim - used, 0), lim using errcode = '53400';
    end if;
  end if;
  return new;
end $$;
create trigger limit_broadcast before update of status on public.campaigns for each row execute function private.limit_broadcast();

grant execute on function private.limit_contacts(), private.limit_seats(), private.limit_storage(), private.limit_broadcast() to authenticated, service_role;

-- The AI assistant pauses when the trial or plan has ended, or the business is suspended.
create or replace view private.ai_waiting as
  select c.id as conversation_id, c.workspace_id, lm.id as message_id
  from public.conversations c
  join public.workspaces w on w.id = c.workspace_id
  cross join lateral (select m.id, m.direction, m.created_at from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm
  where c.handled_by = 'ai' and c.status <> 'closed'
    and coalesce((w.settings -> 'agent' ->> 'enabled')::boolean, true)
    and lm.direction = 'in' and lm.created_at > now() - interval '24 hours'
    and c.ai_answered_to is distinct from lm.id
    and private.plan_active(w.id);

-- ───── paying for a plan (the payment itself is done by the billing function with Bizriva's own Paystack key) ─────
create or replace function public.svc_plan_paid(p_reference text, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pp plan_payments; prev text; w workspaces;
begin
  select * into pp from plan_payments where reference = p_reference for update;
  if pp.id is null then return jsonb_build_object('status', 'unknown'); end if;
  if pp.status = 'paid' then return jsonb_build_object('status', 'duplicate'); end if;
  if p_amount < pp.amount then
    update plan_payments set status = 'failed' where id = pp.id;
    return jsonb_build_object('status', 'short');
  end if;
  select * into w from workspaces where id = pp.workspace_id;
  prev := private.sys_on();
  update plan_payments set status = 'paid', paid_at = now() where id = pp.id;
  update workspaces set plan = pp.plan,
    plan_renews_at = greatest(coalesce(case when w.plan = pp.plan then w.plan_renews_at end, now()), now()) + interval '30 days'
    where id = pp.workspace_id;
  insert into activity_log(workspace_id, entity, entity_id, action, detail) values (pp.workspace_id, 'billing', pp.id, 'plan_paid', jsonb_build_object('plan', pp.plan, 'amount', pp.amount));
  perform private.sys_restore(prev);
  return jsonb_build_object('status', 'paid', 'plan', pp.plan);
end $$;

-- The owner starts paying: a reference for the billing function to charge.
create or replace function public.svc_plan_checkout(p_user uuid, p_workspace uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p plans; ref text; email text;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_workspace and user_id = p_user and role = 'owner') then
    return jsonb_build_object('error', 'Only the owner pays for the plan');
  end if;
  select * into p from plans where id = p_plan;
  if p.id is null or p.price_ngn <= 0 then return jsonb_build_object('error', 'Pick a paid plan'); end if;
  ref := 'BZP-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));
  insert into plan_payments(workspace_id, plan, amount, reference, created_by) values (p_workspace, p.id, p.price_ngn, ref, p_user);
  select u.email into email from auth.users u where u.id = p_user;
  return jsonb_build_object('reference', ref, 'amount', p.price_ngn, 'email', email, 'plan', p.name);
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_plan_paid(text, numeric)', 'svc_plan_checkout(uuid, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ───── Super Admin (Bizriva staff) ─────
create or replace function public.admin_is() returns boolean
language sql stable security definer set search_path = public as $$ select private.is_platform_admin(); $$;
grant execute on function public.admin_is() to authenticated;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'businesses', (select count(*) from workspaces),
      'paying', (select count(*) from workspaces where plan <> 'trial' and private.plan_active(id)),
      'trialsActive', (select count(*) from workspaces where plan = 'trial' and trial_ends_at > now()),
      'suspended', (select count(*) from workspaces where suspended_at is not null),
      'mrr', (select coalesce(sum(p.price_ngn), 0) from workspaces w join plans p on p.id = w.plan where w.plan <> 'trial' and private.plan_active(w.id)),
      'orders30d', (select count(*) from orders where created_at > now() - interval '30 days'),
      'messages24h', (select count(*) from messages where created_at > now() - interval '24 hours')),
    'businesses', coalesce((select jsonb_agg(x order by x ->> 'createdAt' desc) from (
      select jsonb_build_object('id', w.id, 'name', w.name, 'plan', w.plan, 'createdAt', w.created_at, 'trialEndsAt', w.trial_ends_at, 'renewsAt', w.plan_renews_at,
        'active', private.plan_active(w.id), 'suspended', w.suspended_at is not null, 'suspendedReason', w.suspended_reason,
        'owner', (select u.email from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = w.id and m.role = 'owner' order by m.created_at limit 1),
        'members', (select count(*) from workspace_members m where m.workspace_id = w.id),
        'contacts', (select count(*) from contacts c where c.workspace_id = w.id),
        'orders30d', (select count(*) from orders o where o.workspace_id = w.id and o.created_at > now() - interval '30 days'),
        'lastActivity', (select max(m.created_at) from messages m where m.workspace_id = w.id),
        'whatsapp', exists (select 1 from whatsapp_numbers n where n.workspace_id = w.id and n.active),
        'ai', exists (select 1 from ai_keys k where k.workspace_id = w.id and k.active)) as x
      from workspaces w) s), '[]'::jsonb));
end $$;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_set_plan(p_workspace uuid, p_plan text, p_days int) returns void
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  if not exists (select 1 from plans where id = p_plan) then raise exception 'Unknown plan'; end if;
  prev := private.sys_on();
  update workspaces set plan = p_plan,
    trial_ends_at = case when p_plan = 'trial' then now() + make_interval(days => greatest(coalesce(p_days, 14), 1)) else trial_ends_at end,
    plan_renews_at = case when p_plan = 'trial' then null else now() + make_interval(days => greatest(coalesce(p_days, 30), 1)) end
    where id = p_workspace;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail) values (p_workspace, auth.uid(), 'billing', p_workspace, 'admin_set_plan', jsonb_build_object('plan', p_plan, 'days', p_days));
  perform private.sys_restore(prev);
end $$;

create or replace function public.admin_suspend(p_workspace uuid, p_suspend boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  if p_suspend and coalesce(btrim(p_reason), '') = '' then raise exception 'Say why the business is suspended'; end if;
  prev := private.sys_on();
  update workspaces set suspended_at = case when p_suspend then now() end, suspended_reason = case when p_suspend then left(btrim(p_reason), 300) end where id = p_workspace;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail) values (p_workspace, auth.uid(), 'billing', p_workspace, case when p_suspend then 'suspended' else 'unsuspended' end, jsonb_build_object('reason', p_reason));
  perform private.sys_restore(prev);
end $$;

create or replace function public.admin_set_price(p_plan text, p_price numeric, p_contacts int, p_seats int, p_messages int, p_storage int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  if p_price < 0 or least(p_contacts, p_seats, p_messages, p_storage) < 1 then raise exception 'Prices and limits must be positive'; end if;
  update plans set price_ngn = p_price, contacts = p_contacts, seats = p_seats, messages_month = p_messages, storage_mb = p_storage where id = p_plan;
end $$;
revoke execute on function public.admin_overview(), public.admin_set_plan(uuid, text, int), public.admin_suspend(uuid, boolean, text), public.admin_set_price(text, numeric, int, int, int, int) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, int), public.admin_suspend(uuid, boolean, text), public.admin_set_price(text, numeric, int, int, int, int) to authenticated;

-- Super Admins are added by hand in the SQL editor: insert into platform_admins(user_id) values ('<auth user id>');

-- Billing, suspension and channel keys can only change through the functions above.
create or replace function private.guard_workspace() returns trigger
language plpgsql set search_path = public as $$
begin
  if not private.is_system() and (new.plan, new.trial_ends_at, new.plan_renews_at, new.suspended_at, new.suspended_reason, new.webchat_key, new.sms_settings, new.sms_key_secret_id)
     is distinct from (old.plan, old.trial_ends_at, old.plan_renews_at, old.suspended_at, old.suspended_reason, old.webchat_key, old.sms_settings, old.sms_key_secret_id) then
    raise exception 'The plan, billing and channel keys change through Billing and Integrations, not here' using errcode = '42501';
  end if;
  return new;
end $$;
