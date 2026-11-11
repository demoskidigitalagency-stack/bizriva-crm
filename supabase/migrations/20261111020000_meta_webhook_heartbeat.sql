-- When Meta last reached Bizriva's WhatsApp webhook, and whether the signature checked out.
-- Shown to the Super Admin, so "is Meta delivering?" has an answer without digging through logs.
create table private.webhook_heartbeat (
  id boolean primary key default true check (id),
  last_at timestamptz, last_fields text, last_number text, last_ok boolean, total bigint not null default 0
);
insert into private.webhook_heartbeat(id) values (true) on conflict do nothing;

create or replace function public.svc_webhook_seen(p_fields text, p_number text, p_ok boolean) returns void
language sql security definer set search_path = public as $$
  update private.webhook_heartbeat set last_at = now(), last_fields = left(p_fields, 200), last_number = left(p_number, 30), last_ok = p_ok, total = total + 1 where id;
$$;
revoke execute on function public.svc_webhook_seen(text, text, boolean) from public, anon, authenticated;
grant execute on function public.svc_webhook_seen(text, text, boolean) to service_role;

create or replace function public.admin_meta_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  return (select jsonb_build_object('appId', app_id, 'configId', config_id, 'hasSecret', app_secret_id is not null, 'verifyToken', verify_token, 'updatedAt', updated_at,
    'numbers', (select count(*) from whatsapp_numbers where via = 'partner' and active), 'onApp', (select count(*) from whatsapp_numbers where via = 'partner' and on_app and active),
    'lastWebhook', (select jsonb_build_object('at', last_at, 'fields', last_fields, 'number', last_number, 'ok', last_ok, 'total', total) from private.webhook_heartbeat where id))
    from private.platform_meta where id);
end $$;
