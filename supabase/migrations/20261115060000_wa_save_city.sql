-- "Save to my phone": the name format can now use {city} (the town from the chat), so a
-- customer who never gave a name saves as e.g. "Kumasi – Table tennis 4490" instead of "Customer 4490".
drop function if exists public.svc_wa_save_targets(uuid);
create function public.svc_wa_save_targets(p_link uuid)
returns table(wa text, name text, tags text[], template text, location text)
language sql stable security definer set search_path = public as $$
  select ci.external_id, k.name, k.tags, l.save_template, nullif(btrim(coalesce(k.location, '')), '')
  from wa_links l
  join contact_identities ci on ci.workspace_id = l.workspace_id and ci.channel = 'whatsapp'
  join contacts k on k.id = ci.contact_id
  where l.id = p_link and ci.external_id ~ '^\d{7,15}$' and not ('Not a customer' = any(k.tags))
    and (l.save_who = 'all' or (l.save_who = 'asked' and exists (select 1 from unnest(k.tags) t where t like 'Asked about: %'))
         or (l.save_who = 'no_order' and 'No order yet' = any(k.tags)))
  order by k.created_at
$$;
revoke execute on function public.svc_wa_save_targets(uuid) from public, anon, authenticated;
grant execute on function public.svc_wa_save_targets(uuid) to service_role;
