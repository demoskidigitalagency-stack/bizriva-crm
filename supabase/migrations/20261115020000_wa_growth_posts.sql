-- Bizriva CRM — WhatsApp Growth on a linked number: Status, groups, broadcasts, auto-save (2026-11-15).
--
-- From the WhatsApp automation build spec, what the linked number didn't do yet:
--   • Status posts (text, photo, video), now or scheduled, once/daily/weekly, to everyone who has
--     messaged the business or to a tag; delivery and views counted, viewers listed by name.
--   • Groups: the business's WhatsApp groups are listed (synced by the server); owners save
--     collections ("Customers", "Resellers") and post to them now or later, paced between groups.
--   • Broadcasts through the linked number: one message per customer who wrote first, never to
--     personal or opted-out contacts, with "Reply STOP" added; sent through the usual paced queue
--     with its daily limit, so each one also shows in the customer's chat.
--   • Auto-save: each new customer is saved to the phone's contacts as soon as they write.
-- Daily limits per business (settings → waGrowth): 20 Status posts and 500 group messages.

-- ───────────── posts ─────────────
create table public.wa_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('status', 'group', 'broadcast')),
  body text check (length(body) <= 4000),
  media_path text check (length(media_path) <= 300),
  media_kind text check (media_kind in ('image', 'video')),
  bg_color text check (bg_color ~ '^#[0-9a-fA-F]{6}$'),
  -- status/broadcast: {"who": "all"|"asked"|"no_order"|"tag", "tag": "..."}; group: {"groups": ["…@g.us"], "collection": "…"}
  audience jsonb not null default '{"who": "all"}'::jsonb,
  scheduled_for timestamptz not null default now(),
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  state text not null default 'scheduled' check (state in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  recipients int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  views int not null default 0,
  error text check (length(error) <= 300),
  wa_message_id text,
  sent_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (coalesce(btrim(body), '') <> '' or media_path is not null),
  check (media_path is null or media_path like workspace_id::text || '/out/%')
);
create index on public.wa_posts (workspace_id, state, scheduled_for);
create index on public.wa_posts (wa_message_id) where wa_message_id is not null;
alter table public.wa_posts enable row level security;
create policy wa_posts_read on public.wa_posts for select to authenticated using (private.is_member(workspace_id));
create policy wa_posts_add on public.wa_posts for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'manager']::member_role[]) and state = 'scheduled'
              and recipients = 0 and sent = 0 and failed = 0 and views = 0 and wa_message_id is null and sent_at is null);
grant select, insert on public.wa_posts to authenticated;

create table public.wa_post_views (
  post_id uuid not null references public.wa_posts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone text not null check (phone ~ '^\d{7,15}$'),
  contact_id uuid references public.contacts(id) on delete set null,
  viewed_at timestamptz not null default now(),
  primary key (post_id, phone)
);
alter table public.wa_post_views enable row level security;
create policy wa_post_views_read on public.wa_post_views for select to authenticated using (private.is_member(workspace_id));
grant select on public.wa_post_views to authenticated;

-- Cancel a post that hasn't gone out (or stop a repeating one).
create or replace function public.cancel_wa_post(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from wa_posts where id = p_post;
  if ws is null or not private.has_role(ws, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update wa_posts set state = 'cancelled' where id = p_post and state = 'scheduled';
end $$;
revoke execute on function public.cancel_wa_post(uuid) from public, anon;
grant execute on function public.cancel_wa_post(uuid) to authenticated;

-- ───────────── groups and collections ─────────────
create table public.wa_groups (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  jid text not null check (jid ~ '^[0-9-]+@g\.us$'),
  name text check (length(name) <= 200),
  size int not null default 0,
  is_admin boolean not null default false,
  announce boolean not null default false,  -- only admins can post
  updated_at timestamptz not null default now(),
  primary key (workspace_id, jid)
);
alter table public.wa_groups enable row level security;
create policy wa_groups_read on public.wa_groups for select to authenticated using (private.is_member(workspace_id));
grant select on public.wa_groups to authenticated;

create table public.wa_group_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  jids text[] not null default '{}' check (cardinality(jids) <= 500),
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);
alter table public.wa_group_collections enable row level security;
create policy wa_group_collections_read on public.wa_group_collections for select to authenticated using (private.is_member(workspace_id));
create policy wa_group_collections_write on public.wa_group_collections for all to authenticated
  using (private.has_role(workspace_id, array['owner', 'manager']::member_role[]))
  with check (private.has_role(workspace_id, array['owner', 'manager']::member_role[]));
grant select, insert, update, delete on public.wa_group_collections to authenticated;

-- ───────────── auto-save ─────────────
alter table public.wa_links add column if not exists auto_save boolean not null default false;
alter table public.contacts add column if not exists wa_saved_at timestamptz;

create or replace function public.set_wa_auto_save(p_workspace uuid, p_on boolean, p_template text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.has_role(p_workspace, array['owner', 'manager']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update wa_links set auto_save = coalesce(p_on, false),
    save_template = coalesce(nullif(btrim(left(p_template, 80)), ''), save_template)
  where workspace_id = p_workspace;
  insert into activity_log(workspace_id, actor, entity, entity_id, action, detail)
    values (p_workspace, auth.uid(), 'workspace', p_workspace, 'whatsapp_auto_save', jsonb_build_object('on', p_on));
end $$;
revoke execute on function public.set_wa_auto_save(uuid, boolean, text) from public, anon;
grant execute on function public.set_wa_auto_save(uuid, boolean, text) to authenticated;

-- ───────────── who a post goes to ─────────────
-- Phones of customers who have messaged the business, matching the audience.
-- Personal contacts only get a Status sent to "Everyone"; opted-out customers never get a broadcast.
create or replace function private.wa_audience(ws uuid, aud jsonb, for_broadcast boolean) returns table(phone text, contact_id uuid, first_name text)
language sql stable security definer set search_path = public as $$
  select distinct on (ci.external_id) ci.external_id, k.id, coalesce(nullif(split_part(btrim(k.name), ' ', 1), ''), 'there')
  from contact_identities ci join contacts k on k.id = ci.contact_id
  where ci.workspace_id = ws and ci.channel = 'whatsapp' and ci.external_id ~ '^\d{7,15}$'
    and exists (select 1 from conversations c join messages m on m.conversation_id = c.id and m.direction = 'in' where c.contact_id = k.id)
    and (case coalesce(aud ->> 'who', 'all')
           when 'asked' then exists (select 1 from unnest(k.tags) t where t like 'Asked about: %') and not private.is_personal(k.id)
           when 'no_order' then 'No order yet' = any(k.tags) and not private.is_personal(k.id)
           when 'tag' then (aud ->> 'tag') = any(k.tags) and not private.is_personal(k.id)
           else (not for_broadcast or not private.is_personal(k.id)) end)
    and (not for_broadcast or not private.opted_out(k.id))
  order by ci.external_id;
$$;

-- How many a post would reach, for the screen.
create or replace function public.wa_audience_count(p_workspace uuid, p_audience jsonb, p_kind text) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_member(p_workspace) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select count(*) from private.wa_audience(p_workspace, p_audience, p_kind = 'broadcast'));
end $$;
revoke execute on function public.wa_audience_count(uuid, jsonb, text) from public, anon;
grant execute on function public.wa_audience_count(uuid, jsonb, text) to authenticated;

-- ───────────── for the WhatsApp server (service role) ─────────────
-- Due posts for this link. Broadcasts are turned into queued messages right here (the normal
-- paced queue sends them); Status and group posts go back to the server with their recipients.
create or replace function public.svc_wa_posts_claim(p_link uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ws uuid; p wa_posts; prev text; out jsonb := '[]'::jsonb; n int; conv uuid; a record;
  status_cap int; group_cap int; status_today int; group_today int; targets jsonb; stop_line text := E'\n\nReply STOP to stop these messages.';
begin
  select l.workspace_id into ws from wa_links l where l.id = p_link and l.status = 'connected';
  if ws is null then return out; end if;
  select coalesce((settings -> 'waGrowth' ->> 'statusPerDay')::int, 20), coalesce((settings -> 'waGrowth' ->> 'groupPerDay')::int, 500)
    into status_cap, group_cap from workspaces where id = ws;
  select count(*) filter (where kind = 'status'), coalesce(sum(sent) filter (where kind = 'group'), 0) into status_today, group_today
    from wa_posts where workspace_id = ws and sent_at > date_trunc('day', now());
  prev := private.sys_on();
  for p in select * from wa_posts where workspace_id = ws and state = 'scheduled' and scheduled_for <= now() order by scheduled_for limit 5 for update skip locked loop
    if p.kind = 'broadcast' then
      n := 0;
      for a in select * from private.wa_audience(ws, p.audience, true) limit 2000 loop
        conv := private.wa_conversation(ws, a.contact_id);
        insert into messages(workspace_id, conversation_id, direction, body, status, purpose, media_path, media_kind)
          values (ws, conv, 'out', replace(coalesce(p.body, ''), '{{name}}', a.first_name) || stop_line, 'queued', 'marketing', p.media_path, p.media_kind);
        n := n + 1;
      end loop;
      update wa_posts set state = case when n > 0 then 'sent' else 'failed' end, recipients = n, sent = n, sent_at = now(),
        error = case when n = 0 then 'Nobody in this group of customers can be messaged' end where id = p.id;
      perform private.wa_post_repeat(p);
      continue;
    end if;
    if p.kind = 'status' and status_today >= status_cap then
      update wa_posts set scheduled_for = date_trunc('day', now()) + interval '1 day' + interval '8 hours',
        error = format('Today''s limit of %s Status posts was reached — moved to tomorrow', status_cap) where id = p.id;
      continue;
    end if;
    if p.kind = 'group' and group_today >= group_cap then
      update wa_posts set scheduled_for = date_trunc('day', now()) + interval '1 day' + interval '8 hours',
        error = format('Today''s limit of %s group messages was reached — moved to tomorrow', group_cap) where id = p.id;
      continue;
    end if;
    targets := case when p.kind = 'status'
      then coalesce((select jsonb_agg(t.phone) from private.wa_audience(ws, p.audience, false) t), '[]'::jsonb)
      else coalesce((select jsonb_agg(g.jid) from wa_groups g where g.workspace_id = ws
                      and g.jid in (select jsonb_array_elements_text(coalesce(p.audience -> 'groups', '[]'::jsonb)))), '[]'::jsonb) end;
    update wa_posts set state = 'sending', recipients = jsonb_array_length(targets), error = null where id = p.id;
    out := out || jsonb_build_object('id', p.id, 'kind', p.kind, 'body', p.body, 'media_path', p.media_path, 'media_kind', p.media_kind,
      'bg_color', p.bg_color, 'mention_all', coalesce((p.audience ->> 'mentionAll')::boolean, false), 'targets', targets);
    if p.kind = 'status' then status_today := status_today + 1; else group_today := group_today + jsonb_array_length(targets); end if;
  end loop;
  -- A post stuck in "sending" for 30 minutes (server restarted) is tried again.
  update wa_posts set state = 'scheduled' where workspace_id = ws and state = 'sending' and kind <> 'broadcast'
    and coalesce(sent_at, created_at) < now() - interval '30 minutes' and scheduled_for < now() - interval '30 minutes' and sent = 0;
  perform private.sys_restore(prev);
  return out;
end $$;

-- The next one of a daily/weekly post.
create or replace function private.wa_post_repeat(p wa_posts) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p.repeat = 'none' then return; end if;
  insert into wa_posts(workspace_id, kind, body, media_path, media_kind, bg_color, audience, scheduled_for, repeat, created_by)
    values (p.workspace_id, p.kind, p.body, p.media_path, p.media_kind, p.bg_color, p.audience,
            p.scheduled_for + case p.repeat when 'daily' then interval '1 day' else interval '7 days' end, p.repeat, p.created_by);
end $$;

create or replace function public.svc_wa_post_result(p_link uuid, p_post uuid, p_sent int, p_failed int, p_error text, p_message_id text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; p wa_posts; prev text;
begin
  select workspace_id into ws from wa_links where id = p_link;
  select * into p from wa_posts where id = p_post and workspace_id = ws;
  if p.id is null then return; end if;
  prev := private.sys_on();
  update wa_posts set state = case when coalesce(p_sent, 0) > 0 then 'sent' else 'failed' end, sent = coalesce(p_sent, 0), failed = coalesce(p_failed, 0),
    error = left(p_error, 300), wa_message_id = coalesce(p_message_id, wa_message_id), sent_at = now() where id = p.id;
  perform private.wa_post_repeat(p);
  perform private.sys_restore(prev);
end $$;

-- Someone viewed a Status (WhatsApp's read receipt).
create or replace function public.svc_wa_status_view(p_link uuid, p_message_id text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; pid uuid; cid uuid; n int;
begin
  select workspace_id into ws from wa_links where id = p_link;
  select id into pid from wa_posts where workspace_id = ws and kind = 'status' and wa_message_id = p_message_id;
  if pid is null or coalesce(p_phone, '') !~ '^\d{7,15}$' then return; end if;
  select contact_id into cid from contact_identities where workspace_id = ws and channel = 'whatsapp' and external_id = p_phone limit 1;
  insert into wa_post_views(post_id, workspace_id, phone, contact_id) values (pid, ws, p_phone, cid) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update wa_posts set views = views + 1 where id = pid; end if;
end $$;

-- The business's groups, as the server sees them (replaces the list).
create or replace function public.svc_wa_groups_sync(p_link uuid, p_groups jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare ws uuid; n int;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null then return 0; end if;
  insert into wa_groups(workspace_id, jid, name, size, is_admin, announce, updated_at)
    select ws, g ->> 'jid', left(g ->> 'name', 200), coalesce((g ->> 'size')::int, 0), coalesce((g ->> 'admin')::boolean, false), coalesce((g ->> 'announce')::boolean, false), now()
    from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) g where (g ->> 'jid') ~ '^[0-9-]+@g\.us$'
  on conflict (workspace_id, jid) do update set name = excluded.name, size = excluded.size, is_admin = excluded.is_admin, announce = excluded.announce, updated_at = now();
  get diagnostics n = row_count;
  delete from wa_groups where workspace_id = ws and updated_at < now() - interval '1 minute'
    and jid not in (select g ->> 'jid' from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) g);
  return n;
end $$;

-- Auto-save: the name to save a new customer under, if auto-save is on and they aren't saved yet.
create or replace function public.svc_wa_autosave_target(p_link uuid, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('contact', k.id, 'name', k.name, 'tags', k.tags, 'template', l.save_template)
  from wa_links l
  join contact_identities ci on ci.workspace_id = l.workspace_id and ci.channel = 'whatsapp' and ci.external_id = p_phone
  join contacts k on k.id = ci.contact_id
  where l.id = p_link and l.auto_save and k.wa_saved_at is null and not private.is_personal(k.id)
  limit 1;
$$;

create or replace function public.svc_wa_autosave_done(p_link uuid, p_contact uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; prev text;
begin
  select workspace_id into ws from wa_links where id = p_link;
  prev := private.sys_on();
  update contacts set wa_saved_at = now() where id = p_contact and workspace_id = ws;
  perform private.sys_restore(prev);
end $$;

-- "Save to my phone" (the button) marks people saved too, so auto-save doesn't redo them.
create or replace function public.svc_wa_mark_saved(p_link uuid, p_phones text[]) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; prev text;
begin
  select workspace_id into ws from wa_links where id = p_link;
  prev := private.sys_on();
  update contacts k set wa_saved_at = now() from contact_identities ci
  where ci.contact_id = k.id and ci.workspace_id = ws and ci.channel = 'whatsapp' and ci.external_id = any(p_phones) and k.wa_saved_at is null;
  perform private.sys_restore(prev);
end $$;

revoke execute on function public.svc_wa_posts_claim(uuid), public.svc_wa_post_result(uuid, uuid, int, int, text, text),
  public.svc_wa_status_view(uuid, text, text), public.svc_wa_groups_sync(uuid, jsonb), public.svc_wa_autosave_target(uuid, text),
  public.svc_wa_autosave_done(uuid, uuid), public.svc_wa_mark_saved(uuid, text[]), private.wa_audience(uuid, jsonb, boolean),
  private.wa_post_repeat(wa_posts) from public, anon, authenticated;
grant execute on function public.svc_wa_posts_claim(uuid), public.svc_wa_post_result(uuid, uuid, int, int, text, text),
  public.svc_wa_status_view(uuid, text, text), public.svc_wa_groups_sync(uuid, jsonb), public.svc_wa_autosave_target(uuid, text),
  public.svc_wa_autosave_done(uuid, uuid), public.svc_wa_mark_saved(uuid, text[]) to service_role;
