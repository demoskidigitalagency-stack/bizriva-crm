-- Group contacts (like WASBOT's group extractor): the WhatsApp server now reads each group's members'
-- phone numbers when it syncs groups. Members who hide their number from the group can't be read and
-- are only counted (hidden). The owner can download them as a contacts file or add them to customers
-- (tagged "From group: <name>", skipping anyone already a customer). Added group members are not
-- messaged automatically: broadcasts to "people who messaged us" or "asked about a product" never
-- include someone who hasn't written to the business.
alter table public.wa_groups add column if not exists members jsonb not null default '[]';
alter table public.wa_groups add column if not exists hidden int not null default 0;

create or replace function public.svc_wa_groups_sync(p_link uuid, p_groups jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare ws uuid; n int;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return 0; end if;
  insert into wa_groups(workspace_id, jid, name, size, is_admin, announce, members, hidden, updated_at)
    select ws, g ->> 'jid', left(g ->> 'name', 200), coalesce((g ->> 'size')::int, 0), coalesce((g ->> 'admin')::boolean, false), coalesce((g ->> 'announce')::boolean, false),
      coalesce(g -> 'members', '[]'::jsonb), coalesce((g ->> 'hidden')::int, 0), now()
    from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) g where (g ->> 'jid') ~ '^[0-9-]+@g\.us$'
  on conflict (workspace_id, jid) do update set name = excluded.name, size = excluded.size, is_admin = excluded.is_admin, announce = excluded.announce,
    members = case when jsonb_array_length(excluded.members) > 0 then excluded.members else wa_groups.members end, hidden = excluded.hidden, updated_at = now();
  get diagnostics n = row_count;
  delete from wa_groups where workspace_id = ws and updated_at < now() - interval '1 minute'
    and jid not in (select g ->> 'jid' from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) g);
  return n;
end $$;
revoke execute on function public.svc_wa_groups_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.svc_wa_groups_sync(uuid, jsonb) to service_role;

-- Add a group's members as customers. Returns how many were new and how many were already customers.
create or replace function public.add_group_members(p_workspace uuid, p_jid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g wa_groups; added int := 0; existing int := 0; m jsonb; tag text;
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into g from wa_groups where workspace_id = p_workspace and jid = p_jid;
  if g.jid is null then raise exception 'Group not found'; end if;
  tag := 'From group: ' || left(coalesce(nullif(btrim(g.name), ''), 'WhatsApp group'), 80);
  for m in select * from jsonb_array_elements(g.members) loop
    if (m ->> 'phone') !~ '^\d{7,15}$' then continue; end if;
    if exists (select 1 from contacts k where k.workspace_id = p_workspace and private.phone_key(k.phone) = private.phone_key(m ->> 'phone')) then
      update contacts set tags = array(select distinct unnest(tags || array[tag])) where workspace_id = p_workspace and private.phone_key(phone) = private.phone_key(m ->> 'phone');
      existing := existing + 1;
    else
      insert into contacts(workspace_id, phone, tags) values (p_workspace, m ->> 'phone', array[tag]);
      added := added + 1;
    end if;
  end loop;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (p_workspace, auth.uid(), 'workspace', p_workspace, 'whatsapp_group_members_added', jsonb_build_object('group', g.name, 'added', added, 'existing', existing));
  return jsonb_build_object('added', added, 'existing', existing);
end $$;
grant execute on function public.add_group_members(uuid, text) to authenticated;
