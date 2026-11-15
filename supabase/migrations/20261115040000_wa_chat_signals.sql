-- Reading the chats better (Dxmart feedback, 15 Nov): "Tag chats by product" found nothing
-- because customers don't type the catalogue name. Now:
--   * product aliases (already on products) carry the words and prices customers really use;
--   * besides "Asked about: X", chats get stage tags from what the customer wrote:
--       Asked price · Sent order details · Asked location · Pay on delivery · Follow up later
--     and "Waiting on our reply" when the customer spoke last in the past 30 days;
--   * the town a customer mentions fills contacts.location when it is empty;
--   * contacts tagged "Not a customer" (family, suppliers, spam) are left alone.
-- Rules only, no AI; reversible by removing the tags.

create or replace function private.wa_tag_products(p_workspace uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare prev text; n int := 0;
  towns text[] := array['Accra','Kumasi','Tema','Takoradi','Tamale','Cape Coast','Koforidua','Sunyani','Bolgatanga',
    'Tarkwa','Kasoa','Obuasi','Techiman','Ejisu','Madina','Spintex','East Legon','Adenta','Ashaiman','Nkawkaw','Winneba',
    'Agona Swedru','Swedru','Hohoe','Aflao','Keta','Jirapa','Kade','Dansoman','Lapaz','Kpandai','Yendi','Nsawam','Teshie',
    'Weija','Amasaman','Sekondi','Atonsu','Shai Hills','Tema Community','Kintampo','Akim Oda','Mankessim','Elmina','Dambai',
    'Lagos','Abuja','Ibadan','Port Harcourt','Kano','Ikeja','Lekki','Enugu','Benin City','Abeokuta','Owerri','Uyo','Kaduna','Ajah','Surulere'];
begin
  prev := private.sys_on();
  create temp table if not exists _wa_hits(contact_id uuid, product_id uuid, name text, last_at timestamptz) on commit drop;
  truncate _wa_hits;
  insert into _wa_hits
    select c.contact_id, p.id, p.name, max(m.created_at)
    from messages m
    join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
    join contacts k on k.id = c.contact_id and not ('Not a customer' = any(k.tags))
    join products p on p.workspace_id = m.workspace_id and p.active and length(btrim(p.name)) >= 3
    where m.workspace_id = p_workspace and m.body is not null
      and ((m.body ilike '%' || btrim(p.name) || '%'
            and m.body ~* ('(^|[^[:alnum:]])' || regexp_replace(btrim(p.name), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '($|[^[:alnum:]])'))
        or (length(btrim(coalesce(p.sku, ''))) >= 3 and m.body ilike '%' || btrim(p.sku) || '%')
        or exists (select 1 from unnest(p.aliases) al where length(btrim(al)) >= 3
                   and m.body ~* ('(^|[^[:alnum:],.])' || regexp_replace(btrim(al), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '($|[^[:alnum:]])')))
    group by c.contact_id, p.id, p.name;

  update contacts k set tags = (select array(select distinct t from unnest(k.tags || h.tags) t order by t)), updated_at = now()
  from (select contact_id, array_agg(distinct 'Asked about: ' || left(name, 80)) as tags from _wa_hits group by contact_id) h
  where k.id = h.contact_id and not (h.tags <@ k.tags);
  get diagnostics n = row_count;

  update leads l set product_interest_id = h.product_id
  from (select distinct on (contact_id) contact_id, product_id from _wa_hits order by contact_id, last_at desc) h
  where l.contact_id = h.contact_id and l.product_interest_id is null;

  -- Stage tags from what the customer wrote.
  update contacts k set tags = (select array(select distinct t from unnest(k.tags || s.tags) t order by t)), updated_at = now()
  from (
    select c.contact_id, array_remove(array[
      case when bool_or(m.body ~* '(how much|price|cost|amount|last price|\mhw much)') then 'Asked price' end,
      case when bool_or(m.body ~ '(\+?233|\m0)[235][0-9][ -]?[0-9]{3}[ -]?[0-9]{4}\M' or m.body ~* '(\mname\M.*\mlocation\M|\mlocation\M.*\mname\M|deliver (it )?to)') then 'Sent order details' end,
      case when bool_or(m.body ~* '(where (are|is) (you|your)|your (shop|location|office|store)|located|can i come|come and (see|check|buy))') then 'Asked location' end,
      case when bool_or(m.body ~* '(pay(ment)? (on|after|before) delivery|cash on delivery|\mpod\M)') then 'Pay on delivery' end,
      case when bool_or(m.body ~* '(next (week|month|year)|end of (the|this) month|month end|not now|not yet|later|when i get money|salary|by friday|by saturday|this weekend|i will (call|come|get back)|will let you know)') then 'Follow up later' end
    ], null) tags
    from messages m join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
    join contacts k2 on k2.id = c.contact_id and not ('Not a customer' = any(k2.tags))
    where m.workspace_id = p_workspace and m.direction = 'in' and m.body is not null
    group by c.contact_id
  ) s
  where k.id = s.contact_id and cardinality(s.tags) > 0 and not (s.tags <@ k.tags);

  -- Who is waiting on us: their message is the last one, within 30 days.
  update contacts k set tags = array_remove(k.tags, 'Waiting on our reply')
  where k.workspace_id = p_workspace and 'Waiting on our reply' = any(k.tags);
  update contacts k set tags = array_append(k.tags, 'Waiting on our reply')
  from (select distinct on (c.contact_id) c.contact_id, m.direction, m.created_at
        from messages m join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
        where m.workspace_id = p_workspace order by c.contact_id, m.created_at desc) last
  where k.id = last.contact_id and last.direction = 'in' and last.created_at > now() - interval '30 days'
    and not ('Not a customer' = any(k.tags));

  -- Town the customer named (latest mention), only where we don't know it yet.
  update contacts k set location = t.town, updated_at = now()
  from (
    select distinct on (c.contact_id) c.contact_id, tw.town
    from messages m join conversations c on c.id = m.conversation_id and c.channel = 'whatsapp'
    join unnest(towns) tw(town) on m.body ~* ('\m' || tw.town || '\M')
    where m.workspace_id = p_workspace and m.direction = 'in' and m.body is not null
    order by c.contact_id, m.created_at desc, length(tw.town) desc
  ) t
  where k.id = t.contact_id and nullif(btrim(coalesce(k.location, '')), '') is null and not ('Not a customer' = any(k.tags));

  update contacts k set tags = array_append(k.tags, 'No order yet'), updated_at = now()
  where k.workspace_id = p_workspace and not ('No order yet' = any(k.tags)) and not ('Not a customer' = any(k.tags))
    and exists (select 1 from contact_identities ci where ci.contact_id = k.id and ci.channel = 'whatsapp')
    and not exists (select 1 from orders o where o.contact_id = k.id);
  update contacts k set tags = array_remove(k.tags, 'No order yet'), updated_at = now()
  where k.workspace_id = p_workspace and 'No order yet' = any(k.tags) and exists (select 1 from orders o where o.contact_id = k.id);

  update wa_links set tagged = (select count(distinct contact_id) from _wa_hits) where workspace_id = p_workspace;
  perform private.sys_restore(prev);
  return (select count(distinct contact_id) from _wa_hits);
end $$;
revoke all on function private.wa_tag_products(uuid) from public, anon, authenticated;
