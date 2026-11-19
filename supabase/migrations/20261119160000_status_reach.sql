-- Status reach: a WhatsApp Status is only seen by people saved in the linked phone's contacts (who
-- also have the business number saved). wa_status_reach() tells the Status tool how many customers
-- are saved, how many aren't yet, and how a "save to my phone" run is going.
create or replace function public.wa_status_reach(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l wa_links; total int; saved int;
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into l from wa_links where workspace_id = p_workspace;
  select count(*), count(wa_saved_at) into total, saved from contacts
    where workspace_id = p_workspace and length(private.phone_key(phone)) >= 10 and not (coalesce(tags, '{}') && array['Personal', 'Not a customer']);
  return jsonb_build_object('total', total, 'saved', saved, 'linked', l.status = 'connected', 'auto_save', coalesce(l.auto_save, false),
    'template', l.save_template, 'run', l.save_status, 'done', l.save_done, 'of', l.save_total, 'ok', l.save_saved, 'failed', l.save_failed, 'error', l.save_error);
end $$;
grant execute on function public.wa_status_reach(uuid) to authenticated;
