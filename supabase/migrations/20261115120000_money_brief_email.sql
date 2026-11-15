-- Money Brief by email: when Email is ticked on the Money Brief page and the business has
-- connected its email service, the brief goes to the owners and managers at the brief time
-- (business time zone), once a day. Same text as the WhatsApp brief.
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in ('order', 'broadcast', 'test', 'brief'));
alter table public.workspaces add column if not exists brief_email_sent_on date;

create or replace function private.money_brief_emails() returns int
language plpgsql security definer set search_path = public as $$
declare w record; loc timestamp; body text; n int := 0; prev text;
begin
  for w in select * from workspaces where 'email' = any(coalesce(brief_channels, '{}')) and suspended_at is null loop
    loc := now() at time zone coalesce(w.timezone, 'Africa/Lagos');
    continue when loc::time < coalesce(w.brief_time, '07:00') or loc::time > coalesce(w.brief_time, '07:00') + interval '3 hours'
      or w.brief_email_sent_on is not distinct from loc::date or not private.email_ready(w.id);
    body := replace(private.owner_answer(w.id, 'brief'), '*', '');
    body := regexp_replace(body, E'\n\nReply "help".*$', '') || E'\n\nOpen Bizriva for the full Money Brief.\n— Bizriva';
    prev := private.sys_on();
    insert into email_outbox(workspace_id, kind, to_email, subject, body)
      select w.id, 'brief', lower(u.email), 'Money Brief — ' || w.name || ' — ' || to_char(loc, 'Dy DD Mon'), body
      from workspace_members m join auth.users u on u.id = m.user_id
      where m.workspace_id = w.id and m.role in ('owner', 'manager') and u.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    update workspaces set brief_email_sent_on = loc::date where id = w.id;
    perform private.sys_restore(prev);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.money_brief_emails() from public, anon, authenticated;
select cron.schedule('bizriva-money-brief-email', '*/5 * * * *', $job$ select private.money_brief_emails(); $job$);
