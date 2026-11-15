-- Bizriva CRM — follow-up stage and source tags kept up to date on every message (2026-11-15).
--
-- On 14 Nov Dxmart's chats were segmented once by hand into "Follow-up: …" and "Source: …" tags.
-- These now follow each chat as messages come and go:
--   Follow-up: Sent details, confirm order — the customer sent a phone number
--   Follow-up: Replied after price         — we quoted a price and they wrote back
--   Follow-up: Got price, went quiet       — we quoted a price, no reply since
--   Follow-up: No price sent yet           — they wrote, we haven't quoted
--   Source: Facebook ad                    — the chat started from an ad (WhatsApp said so)
--   Source: Facebook ad (likely)           — the first message is an ad's ready-made question
--   Source: Unknown
-- Personal contacts and customers with an order are left alone (the order tells the story).

create or replace function private.followup_stage(conv uuid) returns text
language sql stable security definer set search_path = public as $$
  with m as (
    select direction, body, created_at from messages where conversation_id = conv and body is not null
  ), priced as (
    select min(created_at) as first_at from m where direction = 'out' and body ~ '(₦|GH₵|GHS|KSh|CFA|\$|£|€)\s?\d'
  )
  select case
    -- a phone number: local (0 + 9–10 digits, e.g. 0244 527 125, 0803 123 4567) or international (+233…, +234…)
    when exists (select 1 from m where direction = 'in' and body !~* 'https?://'
                 and regexp_replace(body, '[\s-]', '', 'g') ~ '(^|[^0-9+])(0[2-9]\d{8,9}|\+\d{11,13})([^0-9]|$)') then 'Follow-up: Sent details, confirm order'
    when (select first_at from priced) is null then 'Follow-up: No price sent yet'
    when exists (select 1 from m where direction = 'in' and created_at > (select first_at from priced)) then 'Follow-up: Replied after price'
    else 'Follow-up: Got price, went quiet' end;
$$;

create or replace function private.refresh_followup_tags(conv uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid; tags text[]; stage text; src text; first_in text; prev text;
begin
  select contact_id into cid from conversations where id = conv and channel = 'whatsapp';
  if cid is null or private.is_personal(cid) then return; end if;
  if not exists (select 1 from messages where conversation_id = conv and direction = 'in') then return; end if;
  select k.tags into tags from contacts k where k.id = cid;
  if exists (select 1 from orders o where o.contact_id = cid) then
    stage := null; -- an order supersedes the follow-up stage
  else
    stage := private.followup_stage(conv);
  end if;
  if not exists (select 1 from unnest(coalesce(tags, '{}')) t where t like 'Source: %') then
    select body into first_in from messages where conversation_id = conv and direction = 'in' and body is not null order by created_at limit 1;
    src := case
      when exists (select 1 from leads l where l.contact_id = cid and (l.ad_id is not null or l.ad_name is not null or l.ad_headline is not null)) then 'Source: Facebook ad'
      when coalesce(first_in, '') ~* '^(what.s the price|can i pay on delivery|how do i order|do you deliver to my area|hello! can i get more info on this)' then 'Source: Facebook ad (likely)'
      else 'Source: Unknown' end;
  end if;
  if (stage is null and not exists (select 1 from unnest(coalesce(tags, '{}')) t where t like 'Follow-up: %'))
     or (stage is not null and stage = any(coalesce(tags, '{}')) and src is null) then
    return; -- nothing changes
  end if;
  prev := private.sys_on();
  update contacts set tags = (select coalesce(array_agg(t), '{}') from unnest(coalesce(contacts.tags, '{}')) t where t not like 'Follow-up: %')
      || case when stage is null then '{}'::text[] else array[stage] end
      || case when src is null then '{}'::text[] else array[src] end,
    updated_at = now()
  where id = cid;
  perform private.sys_restore(prev);
end $$;

create or replace function private.followup_tags_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.imported, false) then return null; end if;
  perform private.refresh_followup_tags(new.conversation_id);
  return null;
end $$;

create or replace trigger messages_followup_tags after insert on public.messages for each row execute function private.followup_tags_on_message();

revoke execute on function private.followup_stage(uuid), private.refresh_followup_tags(uuid), private.followup_tags_on_message() from public, anon, authenticated;
