-- Bizriva CRM — WhatsApp templates are submitted to Meta and their approval syncs back (2026-11-06).
--
-- Staff write a template and press "Submit to Meta" (status → submitted). The
-- whatsapp-templates function sends it to the business's WhatsApp Business
-- Account and, every few minutes, reads back what Meta decided (approved,
-- rejected with the reason, paused). Only Meta's answer can make a template
-- "approved" on real data. Changing the text of a submitted or approved
-- template turns it back into a draft (Meta reviews every change).
--
-- Variables when sending: {{1}} = customer's first name, {{2}} = their latest
-- order number, {{3}} = the first product on that order.
-- Pidgin has no WhatsApp language code, so Pidgin templates are submitted as
-- English ("en"); their text stays in Pidgin.

alter table public.message_templates
  add column rejected_reason text,
  add column submitted_at timestamptz,
  add column synced_at timestamptz;

create or replace function private.guard_template() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if private.is_system() then return new; end if;
  if tg_op = 'UPDATE' and (new.body is distinct from old.body or new.name is distinct from old.name or new.category is distinct from old.category or new.language is distinct from old.language)
     and old.status in ('submitted', 'approved') and new.status = old.status then
    new.status := 'draft'; new.meta_template_id := null; new.rejected_reason := null;
  end if;
  if new.status in ('approved', 'rejected') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Only Meta can approve or reject a template — press Submit to Meta' using errcode = '42501';
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    if not exists (select 1 from whatsapp_numbers w where w.workspace_id = new.workspace_id and w.active and w.waba_id is not null) then
      raise exception 'Connect WhatsApp with your Business Account ID first (Integrations → WhatsApp)' using errcode = '22023';
    end if;
    if new.language = 'pcm' and exists (select 1 from message_templates t where t.workspace_id = new.workspace_id and t.name = new.name and t.language = 'en' and t.id <> new.id) then
      raise exception 'An English template already uses the name %. Pidgin templates go to WhatsApp as English, so give this one another name.', new.name using errcode = '23505';
    end if;
    new.meta_template_id := null; new.rejected_reason := null; new.submitted_at := now();
  end if;
  return new;
end $$;
create trigger guard_template before insert or update on public.message_templates for each row execute function private.guard_template();
grant execute on function private.guard_template() to authenticated, service_role;

-- What the template function has to do: one row per business with a WhatsApp Business Account.
create or replace function public.svc_wa_templates_work() returns table(workspace_id uuid, waba_id text, token text, to_submit jsonb)
language sql security definer set search_path = public as $$
  select w.workspace_id, w.waba_id, t.decrypted_secret,
    coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category, 'language', m.language, 'body', m.body))
              from message_templates m where m.workspace_id = w.workspace_id and m.status = 'submitted' and m.meta_template_id is null), '[]'::jsonb)
  from whatsapp_numbers w join vault.decrypted_secrets t on t.id = w.token_secret_id
  where w.active and w.waba_id is not null
    and exists (select 1 from message_templates m where m.workspace_id = w.workspace_id and (m.status = 'submitted' or (m.status = 'approved' and coalesce(m.synced_at, '-infinity') < now() - interval '1 hour')));
$$;

-- Meta's answer for one template (by our id after submitting, or by name + language when syncing).
create or replace function public.svc_wa_template_result(p_workspace uuid, p_template uuid, p_name text, p_language text, p_meta_id text, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  if p_status not in ('submitted', 'approved', 'rejected') then return; end if;
  prev := private.sys_on();
  update message_templates set
      meta_template_id = coalesce(nullif(p_meta_id, ''), meta_template_id),
      status = p_status::template_status,
      rejected_reason = case when p_status = 'rejected' then left(coalesce(nullif(p_reason, ''), 'Rejected by Meta'), 300) end,
      synced_at = now()
    where workspace_id = p_workspace
      and (id = p_template or (p_template is null and name = p_name and (case when language = 'pcm' then 'en' else language end) = split_part(p_language, '_', 1)))
      and status in ('submitted', 'approved', 'rejected');
  perform private.sys_restore(prev);
end $$;

do $$
declare f text;
begin
  foreach f in array array['svc_wa_templates_work()', 'svc_wa_template_result(uuid, uuid, text, text, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Sending a template now carries its variables (see the header).
create or replace function public.svc_whatsapp_claim_v2(p_limit int) returns table(
  id uuid, workspace_id uuid, phone_number_id text, token text, to_phone text, body text, template_name text, in_window boolean,
  media_path text, media_kind text, media_name text, template_params text[])
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text;
begin
  prev := private.sys_on();
  return query
  with picked as (
    select m.id from messages m
    join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
    join whatsapp_numbers w on w.workspace_id = m.workspace_id and w.active
    where m.direction = 'out' and m.status = 'queued' and m.send_attempts < 3 and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')
    order by m.created_at limit least(greatest(p_limit, 1), 100)
    for update of m skip locked
  ), upd as (
    update messages m set claimed_at = now(), send_attempts = m.send_attempts + 1 from picked where m.id = picked.id
    returning m.id, m.workspace_id, m.conversation_id, m.body, m.template_name, m.media_path, m.media_kind, m.media_name
  )
  select u.id, u.workspace_id, w.phone_number_id, t.decrypted_secret,
    coalesce((select ci.external_id from contact_identities ci where ci.contact_id = c.contact_id and ci.channel = 'whatsapp' limit 1), private.phone_key(k.phone)),
    u.body, u.template_name, coalesce(c.last_inbound_at > now() - interval '24 hours', false), u.media_path, u.media_kind, u.media_name,
    case when u.template_name is null then null else
      (array[coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there'),
             coalesce((select o.ref from orders o where o.contact_id = k.id order by o.created_at desc limit 1), 'your order'),
             coalesce((select p.name from orders o join order_items i on i.order_id = o.id join products p on p.id = i.product_id where o.contact_id = k.id order by o.created_at desc, i.id limit 1), 'your item')])
        [1:(select count(distinct x[1]) from message_templates mt, regexp_matches(mt.body, '\{\{(\d+)\}\}', 'g') x
            where mt.workspace_id = u.workspace_id and mt.name = split_part(u.template_name, ':', 1) and mt.status = 'approved')]
    end
  from upd u join conversations c on c.id = u.conversation_id join contacts k on k.id = c.contact_id
  join whatsapp_numbers w on w.workspace_id = u.workspace_id join vault.decrypted_secrets t on t.id = w.token_secret_id;
  perform private.sys_restore(prev);
end $$;
revoke execute on function public.svc_whatsapp_claim_v2(int) from public, anon, authenticated;
grant execute on function public.svc_whatsapp_claim_v2(int) to service_role;

select cron.schedule('bizriva-wa-templates', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/whatsapp-templates',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
  where exists (select 1 from public.message_templates m join public.whatsapp_numbers w on w.workspace_id = m.workspace_id and w.active and w.waba_id is not null
                where m.status = 'submitted' or (m.status = 'approved' and coalesce(m.synced_at, '-infinity') < now() - interval '1 hour') limit 1)
$job$);
