-- Bizriva CRM — payment links on real data (2026-11-06).
--
-- Staff press "Send payment link" in the chat. The payment-link Edge Function
-- (signed-in staff only) creates a link for the order's balance with the
-- business's own Paystack or Flutterwave account and posts it into the
-- customer's chat. When the provider's notification arrives (payments-webhook,
-- signature-checked), the payment is matched to the order by its reference and
-- the request is marked paid.

alter table public.payment_providers add column webhook_secret_id uuid;   -- Flutterwave's secret hash
alter table public.payment_requests
  add column provider text check (provider in ('paystack', 'flutterwave', 'monnify')),
  add column provider_ref text unique check (length(provider_ref) <= 100),
  add column paid_at timestamptz;

-- Flutterwave signs its notifications with a "secret hash" you choose in its dashboard.
create or replace function public.save_payment_hash(p_workspace uuid, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not private.has_role(p_workspace, array['owner','finance']::member_role[]) then raise exception 'Only the owner or finance can add payment keys' using errcode = '42501'; end if;
  if length(coalesce(p_hash, '')) < 8 then raise exception 'The secret hash should be at least 8 characters'; end if;
  if not exists (select 1 from payment_providers where workspace_id = p_workspace) then raise exception 'Add the secret key first'; end if;
  select webhook_secret_id into sid from payment_providers where workspace_id = p_workspace;
  if sid is null then
    sid := vault.create_secret(p_hash, 'payhash_' || p_workspace::text || '_' || extract(epoch from now())::bigint, 'Payment notification hash for workspace ' || p_workspace);
    update payment_providers set webhook_secret_id = sid where workspace_id = p_workspace;
  else perform vault.update_secret(sid, p_hash); end if;
end $$;
-- Disconnect: keys wiped (overwritten); links and notifications stop working.
create or replace function public.disconnect_payments(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p payment_providers;
begin
  if not private.has_role(p_workspace, array['owner','finance']::member_role[]) then raise exception 'Only the owner or finance can disconnect payments' using errcode = '42501'; end if;
  select * into p from payment_providers where workspace_id = p_workspace;
  if p is null then return; end if;
  if p.key_secret_id is not null then perform vault.update_secret(p.key_secret_id, ''); end if;
  if p.webhook_secret_id is not null then perform vault.update_secret(p.webhook_secret_id, ''); end if;
end $$;
do $$
declare f text;
begin
  foreach f in array array['save_payment_hash(uuid, text)', 'disconnect_payments(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- What the app may show about the connection (no keys).
create or replace function public.payment_connection(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when private.is_member(p_workspace) then (
    select jsonb_build_object('provider', p.provider, 'connected_at', p.connected_at,
      'has_key', exists (select 1 from vault.decrypted_secrets s where s.id = p.key_secret_id and s.decrypted_secret <> ''),
      'has_hash', exists (select 1 from vault.decrypted_secrets s where s.id = p.webhook_secret_id and s.decrypted_secret <> ''))
    from payment_providers p where p.workspace_id = p_workspace) end;
$$;
revoke execute on function public.payment_connection(uuid) from public, anon;
grant execute on function public.payment_connection(uuid) to authenticated;

-- ───────────── server-only ─────────────

-- Keys for the webhook, now including Flutterwave's hash.
create or replace function public.svc_provider_secrets(p_workspace uuid) returns table(provider text, secret text, hash text)
language sql security definer set search_path = public as $$
  select p.provider, nullif(s.decrypted_secret, ''), nullif(h.decrypted_secret, '')
  from payment_providers p left join vault.decrypted_secrets s on s.id = p.key_secret_id left join vault.decrypted_secrets h on h.id = p.webhook_secret_id
  where p.workspace_id = p_workspace;
$$;

-- Everything the link needs, after checking the person may ask for payment on this order.
create or replace function public.svc_payment_context(p_user uuid, p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders; k contacts; w workspaces; p payment_providers; key text; role member_role;
begin
  select * into o from orders where id = p_order;
  if o is null then return jsonb_build_object('error', 'Order not found'); end if;
  select m.role into role from workspace_members m where m.workspace_id = o.workspace_id and m.user_id = p_user;
  if role is null or role not in ('owner', 'manager', 'sales', 'finance') then return jsonb_build_object('error', 'You can''t request payment for this business'); end if;
  if o.status in ('cancelled', 'returned', 'refused') then return jsonb_build_object('error', 'This order is ' || o.status); end if;
  if o.total - coalesce(o.amount_paid, 0) <= 0 then return jsonb_build_object('error', 'This order is already paid'); end if;
  select * into k from contacts where id = o.contact_id;
  select * into w from workspaces where id = o.workspace_id;
  select * into p from payment_providers where workspace_id = o.workspace_id;
  select nullif(decrypted_secret, '') into key from vault.decrypted_secrets where id = p.key_secret_id;
  if key is null then return jsonb_build_object('error', 'Connect Paystack or Flutterwave on the Payments page first'); end if;
  if p.provider = 'monnify' then return jsonb_build_object('error', 'Payment links work with Paystack or Flutterwave. Monnify confirms bank transfers.'); end if;
  return jsonb_build_object('workspace_id', o.workspace_id, 'order_id', o.id, 'order_ref', o.ref, 'contact_id', k.id,
    'amount', o.total - coalesce(o.amount_paid, 0), 'currency', w.currency, 'business', w.name,
    'name', coalesce(k.name, 'Customer'), 'phone', k.phone, 'email', k.email, 'provider', p.provider, 'key', key);
end $$;

-- The link was created: record it and post it into the customer's chat.
create or replace function public.svc_payment_request(p_user uuid, p_order uuid, p_amount numeric, p_url text, p_provider text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; k contacts; mid uuid; prev text; rid uuid;
begin
  select * into o from orders where id = p_order;
  select * into k from contacts where id = o.contact_id;
  prev := private.sys_on();
  insert into payment_requests(workspace_id, order_id, contact_id, amount, methods, link_url, created_by, provider, provider_ref)
    values (o.workspace_id, o.id, o.contact_id, p_amount, array['link'], p_url, p_user, p_provider, p_ref) returning id into rid;
  mid := private.queue_to_customer(o.workspace_id, o.contact_id,
    'Hi ' || coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there') || ', here is your secure payment link for order ' || o.ref || ' (' || private.money(o.workspace_id, p_amount) || E'):\n' || p_url ||
    E'\n\nYou can pay by card, bank transfer or USSD. We''ll confirm here as soon as it lands.');
  perform private.sys_restore(prev);
  return jsonb_build_object('request', rid, 'message', mid, 'queued', mid is not null);
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_provider_secrets(uuid)', 'svc_payment_context(uuid, uuid)', 'svc_payment_request(uuid, uuid, numeric, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- When money lands on an order, its open payment requests follow.
create or replace function private.payment_request_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if new.order_id is null or new.status not in ('matched', 'over', 'part') then return null; end if;
  if tg_op = 'UPDATE' and old.order_id is not distinct from new.order_id and old.status = new.status then return null; end if;
  prev := private.sys_on();
  update payment_requests set status = case when new.status = 'part' then 'part_paid' else 'paid' end, paid_at = now()
    where order_id = new.order_id and status in ('sent', 'part_paid');
  perform private.sys_restore(prev);
  return null;
end $$;
create trigger payment_request_paid after insert or update of status, order_id on public.payment_events for each row execute function private.payment_request_paid();
grant execute on function private.payment_request_paid() to authenticated, service_role;
