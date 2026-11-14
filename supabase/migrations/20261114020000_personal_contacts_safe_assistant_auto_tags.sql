-- Bizriva CRM — personal contacts, a safe assistant default, and tags on new chats (2026-11-14).
--
-- 1. Personal contacts. A linked WhatsApp is often the owner's own phone, so family and friends
--    arrive as "leads". A contact tagged "Personal" is never answered by the assistant, never gets
--    follow-ups or marketing, and is left out of the lead screens. Staff switch it per contact.
-- 2. The assistant is OFF until the owner switches it on (it used to answer as soon as a number
--    was connected, before any products or answers were loaded).
-- 3. New customer messages are tagged "Asked about: <product>" as they arrive, by the product's
--    name or one of its other names (products.aliases), and the lead's product interest is set.
-- 4. "No reply after price" follow-ups recognise prices in any currency, not only naira.

-- ───────────── 1. personal contacts ─────────────
create or replace function private.is_personal(contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select 'Personal' = any(k.tags) from contacts k where k.id = contact), false);
$$;

-- Follow-ups, broadcasts and marketing sends already skip opted-out customers; personal contacts count the same.
create or replace function private.opted_out(contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_personal(contact)
    or coalesce((select not s.granted from consents s where s.contact_id = contact and s.category = 'marketing' order by s.recorded_at desc limit 1), false);
$$;

create or replace view private.ai_waiting as
  select c.id as conversation_id, c.workspace_id, lm.id as message_id
  from public.conversations c
  join public.workspaces w on w.id = c.workspace_id
  cross join lateral (select m.id, m.direction, m.created_at from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm
  where c.handled_by = 'ai' and c.status <> 'closed'
    and coalesce((w.settings -> 'agent' ->> 'enabled')::boolean, false)
    and lm.direction = 'in' and lm.created_at > now() - interval '24 hours'
    and c.ai_answered_to is distinct from lm.id
    and private.plan_active(w.id)
    and not private.is_personal(c.contact_id);
revoke all on private.ai_waiting from public, anon, authenticated;

create or replace function public.set_contact_personal(p_contact uuid, p_personal boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; prev text;
begin
  select workspace_id into ws from contacts where id = p_contact;
  if ws is null or not private.is_member(ws) then raise exception 'Not allowed' using errcode = '42501'; end if;
  prev := private.sys_on();
  if p_personal then
    update contacts set tags = array_append(tags, 'Personal'), updated_at = now() where id = p_contact and not ('Personal' = any(tags));
    update conversations set handled_by = 'human' where contact_id = p_contact and handled_by = 'ai';
  else
    update contacts set tags = array_remove(tags, 'Personal'), updated_at = now() where id = p_contact;
  end if;
  perform private.sys_restore(prev);
end $$;
revoke execute on function public.set_contact_personal(uuid, boolean) from public, anon;
grant execute on function public.set_contact_personal(uuid, boolean) to authenticated;

-- ───────────── 2. assistant off until switched on ─────────────
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosrc like '%''agent'' ->> ''enabled'')::boolean, true)%' loop
    d := replace(pg_get_functiondef(r.oid), '''agent'' ->> ''enabled'')::boolean, true)', '''agent'' ->> ''enabled'')::boolean, false)');
    execute d;
  end loop;
end $$;

-- ───────────── 3. tags on new chats ─────────────
alter table public.products add column if not exists aliases text[] not null default '{}';
comment on column public.products.aliases is 'Other names customers and ads use for this product, matched when tagging chats';

create or replace function private.tag_inbound_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid; hit record; prev text;
begin
  if new.direction <> 'in' or coalesce(new.imported, false) or new.body is null then return null; end if;
  select contact_id into cid from conversations where id = new.conversation_id;
  if cid is null or private.is_personal(cid) then return null; end if;
  for hit in
    select p.id, p.name from products p
    where p.workspace_id = new.workspace_id and p.active
      and exists (select 1 from unnest(array[p.name] || p.aliases) a where length(btrim(a)) >= 3 and new.body ilike '%' || btrim(a) || '%')
  loop
    prev := private.sys_on();
    update contacts set tags = array_append(tags, 'Asked about: ' || left(hit.name, 80)), updated_at = now()
      where id = cid and not (('Asked about: ' || left(hit.name, 80)) = any(tags));
    update leads set product_interest_id = hit.id where contact_id = cid and product_interest_id is null;
    perform private.sys_restore(prev);
  end loop;
  return null;
end $$;
drop trigger if exists messages_tag_product on public.messages;
create trigger messages_tag_product after insert on public.messages for each row execute function private.tag_inbound_product();

-- "Tag chats by product" (the button, and after old chats come in) also reads the other names.
do $$
declare d text; a text := '|| btrim(p.sku) || ''%''))'; b text;
begin
  d := pg_get_functiondef('private.wa_tag_products(uuid)'::regprocedure);
  if position('p.aliases' in d) = 0 then
    b := replace(d, a, '|| btrim(p.sku) || ''%'') or exists (select 1 from unnest(p.aliases) al where length(btrim(al)) >= 3 and m.body ilike ''%'' || btrim(al) || ''%''))');
    if b = d then raise exception 'wa_tag_products changed shape — update this migration'; end if;
    execute b;
  end if;
end $$;

-- ───────────── 4. prices in any currency ─────────────
do $$
declare d text;
begin
  d := pg_get_functiondef('private.followup_candidates()'::regprocedure);
  if position('GH₵' in d) = 0 then
    execute replace(d, '₦\s?\d', '(₦|GH₵|GHS|KSh|CFA|\$|£|€)\s?\d');
  end if;
end $$;
