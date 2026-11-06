-- Bizriva CRM — sending email for real (2026-11-06).
--
-- Each business connects its own email service (Brevo, Resend or Mailgun); the
-- key lives in Vault. The server fills an outbox and the email-send Edge
-- Function sends it every minute:
--   * order emails — confirmed / dispatched / delivered (with the receipt), when
--     Settings → Notifications says "email" for that step and the customer has an email
--   * email broadcasts — to customers with an email whose latest marketing
--     consent is yes; every one carries a working unsubscribe link
--   * a test email the owner sends to themselves

-- Connect (Brevo, Resend or Mailgun). Replaces the earlier version, which listed services we can't send through.
create or replace function public.save_email_key(p_workspace uuid, p_provider text, p_from text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect an email service' using errcode = '42501'; end if;
  if p_provider not in ('brevo', 'resend', 'mailgun') then raise exception 'Pick Brevo, Resend or Mailgun'; end if;
  if coalesce(p_from, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the address to send from'; end if;
  select email_key_secret_id into sid from workspaces where id = p_workspace;
  if length(coalesce(p_secret, '')) < 16 and (sid is null or coalesce(p_secret, '') <> '') then raise exception 'That doesn''t look like an API key'; end if;
  if sid is null then sid := vault.create_secret(p_secret, 'email_' || p_workspace::text || '_' || extract(epoch from now())::bigint, 'Email key for workspace ' || p_workspace);
  elsif coalesce(p_secret, '') <> '' then perform vault.update_secret(sid, p_secret); end if;
  update workspaces set email_key_secret_id = sid, email_settings = jsonb_build_object('provider', p_provider, 'from', lower(p_from), 'connected_at', now()) where id = p_workspace;
end $$;
-- Disconnect: the key is wiped (overwritten) and sending stops.
create or replace function public.disconnect_email(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect email' using errcode = '42501'; end if;
  select email_key_secret_id into sid from workspaces where id = p_workspace;
  if sid is not null then perform vault.update_secret(sid, ''); end if;
  update workspaces set email_settings = jsonb_build_object('provider', 'none') where id = p_workspace;
end $$;
revoke execute on function public.disconnect_email(uuid) from public, anon;
grant execute on function public.disconnect_email(uuid) to authenticated;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  kind text not null check (kind in ('order', 'broadcast', 'test')),
  to_email text not null check (to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) <= 20000),
  tracking_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text check (length(error) <= 500),
  attempts int not null default 0,
  claimed_at timestamptz,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (campaign_id, contact_id)
);
create index email_outbox_queue on public.email_outbox (created_at) where status = 'queued';
create index on public.email_outbox (workspace_id, created_at desc);
alter table public.email_outbox enable row level security;
-- Owners and managers see what was sent; only the server writes.
create policy "owners and managers see sent email" on public.email_outbox for select to authenticated
  using (private.has_role(workspace_id, array['owner','manager']::member_role[]));

create or replace function private.email_ready(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(w.email_settings ->> 'provider', 'none') in ('brevo', 'resend', 'mailgun')
     and exists (select 1 from vault.decrypted_secrets s where s.id = w.email_key_secret_id and s.decrypted_secret <> '')
  from workspaces w where w.id = ws;
$$;

-- Order emails, by the same notification settings as WhatsApp.
create or replace function private.email_order_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare w workspaces; k contacts; ev text; subj text; msg text; first text; prev text;
begin
  if new.status is not distinct from old.status or new.status not in ('confirmed', 'dispatched', 'delivered') then return null; end if;
  ev := case new.status when 'confirmed' then 'order_confirmed' when 'dispatched' then 'dispatched' else 'delivered' end;
  select * into w from workspaces where id = new.workspace_id;
  if coalesce(w.settings -> 'notify' ->> ev, '') <> 'email' or not private.email_ready(w.id) then return null; end if;
  select * into k from contacts where id = new.contact_id;
  if k.email is null or k.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  first := coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there');
  subj := case ev
    when 'order_confirmed' then 'Your order ' || new.ref || ' is confirmed'
    when 'dispatched' then 'Your order ' || new.ref || ' is on its way'
    else 'Your order ' || new.ref || ' was delivered — receipt ' || coalesce(new.receipt_no, new.ref) end;
  msg := 'Hi ' || first || E',\n\n' || case ev
    when 'order_confirmed' then 'Thank you — your order is confirmed. We''ll let you know when it''s on its way.'
    when 'dispatched' then 'Your order has left us and is on its way to you.' || case when new.payment_method = 'cod' then ' Please have ' || private.money(w.id, new.total - coalesce(new.amount_paid, 0)) || ' ready to pay on delivery.' else '' end
    else 'Your order was delivered. Here is your receipt.' || E'\n\nReceipt: ' || coalesce(new.receipt_no, new.ref) || E'\nPaid: ' || private.money(w.id, coalesce(new.amount_paid, new.total)) end
    || E'\n\nOrder ' || new.ref || E':\n' || private.order_lines(new) || E'\nTotal: ' || private.money(w.id, new.total)
    || E'\n\nThank you,\n' || w.name;
  prev := private.sys_on();
  insert into email_outbox(workspace_id, contact_id, order_id, kind, to_email, subject, body) values (w.id, k.id, new.id, 'order', lower(k.email), subj, msg);
  perform private.sys_restore(prev);
  return null;
end $$;
create trigger email_order_notice after update of status on public.orders for each row execute function private.email_order_notice();
grant execute on function private.email_order_notice() to authenticated, service_role;

-- Test email to the owner or manager themselves.
create or replace function public.send_test_email(p_workspace uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me text; prev text;
begin
  if not private.has_role(p_workspace, array['owner','manager']::member_role[]) then raise exception 'Only an owner or a manager can send a test' using errcode = '42501'; end if;
  if not private.email_ready(p_workspace) then raise exception 'Connect your email service first'; end if;
  select email into me from auth.users where id = auth.uid();
  prev := private.sys_on();
  insert into email_outbox(workspace_id, kind, to_email, subject, body)
    select p_workspace, 'test', lower(me), 'Test email from ' || name, E'This is a test from Bizriva.\n\nIf you can read this, emails to your customers will arrive too.\n\n' || name from workspaces where id = p_workspace;
  perform private.sys_restore(prev);
  return me;
end $$;
revoke execute on function public.send_test_email(uuid) from public, anon;
grant execute on function public.send_test_email(uuid) to authenticated;

-- ───────────── server-only (email-send / email-unsub Edge Functions) ─────────────

-- Turn due email broadcasts into outbox rows: customers with an email whose latest marketing consent is yes.
create or replace function private.email_expand_broadcasts() returns int
language plpgsql security definer set search_path = public as $$
declare c campaigns; n int := 0; added int;
begin
  for c in select * from campaigns where channel = 'email' and status = 'scheduled' and coalesce(scheduled_for, now()) <= now() for update skip locked loop
    if not private.email_ready(c.workspace_id) then continue; end if;
    update campaigns set status = 'sending' where id = c.id;
    with audience as (
      select k.id, lower(k.email) as email, coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there') as first
      from contacts k
      where k.workspace_id = c.workspace_id and k.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        and (select s.granted from consents s where s.contact_id = k.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is true
    ), rec as (
      insert into campaign_recipients(campaign_id, workspace_id, contact_id) select c.id, c.workspace_id, a.id from audience a
      on conflict do nothing returning contact_id, tracking_id
    )
    insert into email_outbox(workspace_id, contact_id, campaign_id, kind, to_email, subject, body, tracking_id)
      select c.workspace_id, a.id, c.id, 'broadcast', a.email, replace(c.subject, '{{name}}', a.first), replace(c.body, '{{name}}', a.first), r.tracking_id
      from rec r join audience a on a.id = r.contact_id
      on conflict do nothing;
    get diagnostics added = row_count;
    n := n + added;
    if added = 0 then update campaigns set status = 'sent', sent_at = now() where id = c.id; end if;
  end loop;
  return n;
end $$;

create or replace function public.svc_email_claim(p_limit int) returns table(
  id uuid, provider text, from_email text, from_name text, api_key text, to_email text, subject text, body text, kind text, tracking_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text;
begin
  prev := private.sys_on();
  perform private.email_expand_broadcasts();
  return query
  with picked as (
    select o.id from email_outbox o join workspaces w on w.id = o.workspace_id
    where o.status = 'queued' and o.attempts < 3 and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and coalesce(w.email_settings ->> 'provider', 'none') in ('brevo', 'resend', 'mailgun')
    order by o.created_at limit least(greatest(p_limit, 1), 100)
    for update of o skip locked
  ), upd as (
    update email_outbox o set claimed_at = now(), attempts = o.attempts + 1 from picked where o.id = picked.id
    returning o.id, o.workspace_id, o.to_email, o.subject, o.body, o.kind, o.tracking_id
  )
  select u.id, w.email_settings ->> 'provider', w.email_settings ->> 'from', coalesce(nullif(w.settings -> 'email' ->> 'fromName', ''), w.name),
    nullif(s.decrypted_secret, ''), u.to_email, u.subject, u.body, u.kind, u.tracking_id
  from upd u join workspaces w on w.id = u.workspace_id left join vault.decrypted_secrets s on s.id = w.email_key_secret_id;
  perform private.sys_restore(prev);
end $$;

create or replace function public.svc_email_result(p_id uuid, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; o email_outbox;
begin
  prev := private.sys_on();
  if p_provider_id is not null then
    update email_outbox set status = 'sent', provider_id = left(p_provider_id, 200), sent_at = now(), error = null where id = p_id returning * into o;
    if o.campaign_id is not null then update campaign_recipients set delivered_at = now() where campaign_id = o.campaign_id and contact_id = o.contact_id; end if;
  else
    update email_outbox set status = case when attempts >= 3 or (p_error like '4__ %' and p_error not like '429%') then 'failed' else 'queued' end, error = left(p_error, 500),
      claimed_at = null where id = p_id returning * into o;
  end if;
  if o.campaign_id is not null and not exists (select 1 from email_outbox where campaign_id = o.campaign_id and status = 'queued') then
    update campaigns set status = 'sent', sent_at = coalesce(sent_at, now()) where id = o.campaign_id and status = 'sending';
  end if;
  perform private.sys_restore(prev);
end $$;

-- The unsubscribe link: records the opt-out so no more broadcasts go to this customer.
create or replace function public.svc_email_unsubscribe(p_tracking uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r campaign_recipients; prev text; biz text;
begin
  select * into r from campaign_recipients where tracking_id = p_tracking;
  if r is null then return null; end if;
  select name into biz from workspaces where id = r.workspace_id;
  if r.unsubscribed_at is null then
    prev := private.sys_on();
    update campaign_recipients set unsubscribed_at = now() where campaign_id = r.campaign_id and contact_id = r.contact_id;
    insert into consents(workspace_id, contact_id, channel, category, granted, source, evidence)
      values (r.workspace_id, r.contact_id, 'email', 'marketing', false, 'unsubscribe link', p_tracking::text);
    perform private.sys_restore(prev);
  end if;
  return biz;
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_email_claim(int)', 'svc_email_result(uuid, text, text)', 'svc_email_unsubscribe(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

select cron.schedule('bizriva-email-send', '* * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/email-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.email_outbox where status = 'queued')
     or exists (select 1 from public.campaigns where channel = 'email' and status = 'scheduled' and coalesce(scheduled_for, now()) <= now())
$job$);

alter publication supabase_realtime add table public.email_outbox;
