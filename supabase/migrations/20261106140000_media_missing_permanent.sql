-- A missing file won't appear on retry: fail it straight away (like "outside the 24-hour window").
create or replace function public.svc_whatsapp_result(p_message uuid, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; ws uuid; per_message boolean := p_error like 'Outside%' or p_error like 'No phone%' or p_error like 'The file%';
begin
  prev := private.sys_on();
  if p_provider_id is not null then
    update messages set status = 'sent', provider_message_id = p_provider_id, error = null where id = p_message returning workspace_id into ws;
    update whatsapp_numbers set last_sent_at = now(), last_error = null where workspace_id = ws;
  else
    update messages set status = case when send_attempts >= 3 or per_message then 'failed'::message_status else 'queued'::message_status end,
      error = left(p_error, 500), claimed_at = case when send_attempts >= 3 then claimed_at else null end where id = p_message returning workspace_id into ws;
    if not per_message then update whatsapp_numbers set last_error = left(p_error, 500) where workspace_id = ws; end if;
  end if;
  perform private.sys_restore(prev);
end $$;
