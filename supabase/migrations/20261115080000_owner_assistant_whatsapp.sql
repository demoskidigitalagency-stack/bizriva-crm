-- Money Brief on WhatsApp + owner assistant, through the linked number (no Meta template needed):
-- the brief lands in the owner's own "Message yourself" chat at the time set on the Money Brief
-- page (WhatsApp ticked), and anything the owner types in that chat is answered from the books —
-- "sales today", "cash with riders", "who owes", "waiting", "tasks", "brief", "help". Rules only.
alter table public.wa_links add column if not exists brief_sent_on date;

create or replace function private.money_fmt(ws uuid, n numeric) returns text language sql stable set search_path = public as $$
  select coalesce(case (select currency from workspaces where id = ws) when 'GHS' then 'GH₵' when 'NGN' then '₦' when 'KES' then 'KSh ' when 'USD' then '$' when 'GBP' then '£' else (select currency || ' ' from workspaces where id = ws) end, '')
    || to_char(round(coalesce(n, 0)), 'FM999,999,999,990')
$$;

create or replace function private.owner_answer(ws uuid, q text) returns text
language plpgsql stable security definer set search_path = public as $$
declare tz text := coalesce((select timezone from workspaces where id = ws), 'Africa/Lagos');
  today date := (now() at time zone tz)::date; t text := lower(coalesce(q, '')); r text := ''; n int; v numeric; v2 numeric;
  d0 date; d1 date; label text;
begin
  if t ~ '(help|what can|menu|\?$)' and t !~ '(sale|cash|owe|order|wait|task|brief|today|week|month)' then
    return E'*Ask me in this chat:*\n• sales today / yesterday / this week / this month\n• orders waiting\n• cash with riders\n• who owes\n• waiting for reply\n• tasks\n• brief';
  end if;
  if t ~ '(brief|morning|summary|report)' then
    d0 := today - 1;
    select count(*), coalesce(sum(total), 0) into n, v from orders where workspace_id = ws and (created_at at time zone tz)::date = d0 and status::text not in ('cancelled','refused','returned');
    r := format(E'*Money Brief — %s*\nYesterday: %s order%s, %s', to_char(today, 'Dy DD Mon'), n, case when n = 1 then '' else 's' end, private.money_fmt(ws, v));
    select coalesce(sum(o.total), 0) into v from orders o where o.workspace_id = ws and o.status = 'delivered' and (o.created_at at time zone tz)::date >= date_trunc('month', today)::date;
    r := r || E'\nDelivered this month: ' || private.money_fmt(ws, v);
    select coalesce(sum(cash_collected), 0), count(*) into v, n from deliveries where workspace_id = ws and cash_collected > 0 and cash_remitted_at is null;
    if v > 0 then r := r || format(E'\nCash with riders: %s (%s deliver%s)', private.money_fmt(ws, v), n, case when n = 1 then 'y' else 'ies' end); end if;
    select count(*), coalesce(sum(total - amount_paid), 0) into n, v from orders where workspace_id = ws and status = 'delivered' and total > amount_paid;
    if n > 0 then r := r || format(E'\nOwed on delivered orders: %s (%s)', private.money_fmt(ws, v), n); end if;
    select count(*) into n from orders where workspace_id = ws and status = 'pending_verification';
    if n > 0 then r := r || format(E'\nOrders to confirm: %s', n); end if;
    select count(*) into n from contacts where workspace_id = ws and 'Waiting on our reply' = any(tags);
    if n > 0 then r := r || format(E'\nChats waiting for your reply: %s', n); end if;
    select count(*) into n from tasks where workspace_id = ws and status = 'open' and (due_at at time zone tz)::date <= today;
    if n > 0 then r := r || format(E'\nFollow-ups due today: %s', n); end if;
    select count(distinct c.contact_id) into n from conversations c where c.workspace_id = ws and (c.created_at at time zone tz)::date = d0;
    if n > 0 then r := r || format(E'\nNew chats yesterday: %s', n); end if;
    return r || E'\n\nReply "help" for what else you can ask.';
  end if;
  if t ~ '(sale|sold|revenue|made|order)' and t !~ '(wait|confirm|pending)' then
    if t ~ 'yesterday' then d0 := today - 1; d1 := today - 1; label := 'Yesterday';
    elsif t ~ 'week' then d0 := date_trunc('week', today)::date; d1 := today; label := 'This week';
    elsif t ~ 'month' then d0 := date_trunc('month', today)::date; d1 := today; label := 'This month';
    else d0 := today; d1 := today; label := 'Today'; end if;
    select count(*), coalesce(sum(total), 0), coalesce(sum(amount_paid), 0) into n, v, v2 from orders
      where workspace_id = ws and (created_at at time zone tz)::date between d0 and d1 and status::text not in ('cancelled','refused','returned');
    return format('%s: %s order%s worth %s, %s paid so far.', label, n, case when n = 1 then '' else 's' end, private.money_fmt(ws, v), private.money_fmt(ws, v2));
  end if;
  if t ~ '(cash|rider)' then
    select coalesce(sum(cash_collected), 0), count(*) into v, n from deliveries where workspace_id = ws and cash_collected > 0 and cash_remitted_at is null;
    return case when v > 0 then format('Riders are holding %s from %s deliver%s, not yet handed in.', private.money_fmt(ws, v), n, case when n = 1 then 'y' else 'ies' end) else 'No cash is waiting with riders.' end;
  end if;
  if t ~ '(owe|debt|balance|unpaid|outstanding)' then
    select string_agg(format('• %s — %s', coalesce(k.name, k.phone, 'Customer'), private.money_fmt(ws, o.total - o.amount_paid)), E'\n' order by o.total - o.amount_paid desc), count(*), sum(o.total - o.amount_paid)
      into r, n, v from (select * from orders where workspace_id = ws and status::text not in ('cancelled','refused','returned') and total > amount_paid and amount_paid > 0 order by total - amount_paid desc limit 10) o join contacts k on k.id = o.contact_id;
    return case when n > 0 then format(E'Part-paid orders with a balance (%s):\n%s', private.money_fmt(ws, v), r) else 'No part-paid orders with a balance.' end;
  end if;
  if t ~ '(wait|reply|unanswered|confirm|pending)' then
    if t ~ '(confirm|pending|order)' then
      select count(*) into n from orders where workspace_id = ws and status = 'pending_verification';
      return format('%s order%s waiting for confirmation in Orders.', n, case when n = 1 then '' else 's' end);
    end if;
    select string_agg(format('• %s%s', coalesce(name || ' ' || phone, phone, name, 'Customer'), coalesce(' (' || nullif(location, '') || ')', '')), E'\n'), count(*) into r, n
      from (select * from contacts where workspace_id = ws and 'Waiting on our reply' = any(tags) order by updated_at desc limit 10) k;
    return case when n > 0 then format(E'Waiting for your reply:\n%s', r) else 'Nobody is waiting for a reply.' end;
  end if;
  if t ~ '(task|follow|todo|to do)' then
    select string_agg(format('• %s', left(title, 90)), E'\n'), count(*) into r, n
      from (select title from tasks where workspace_id = ws and status = 'open' and (due_at at time zone tz)::date <= today order by due_at limit 10) x;
    return case when n > 0 then format(E'Due today or overdue:\n%s', r) else 'No follow-ups due today.' end;
  end if;
  return 'I didn''t catch that. Reply "help" to see what I can answer.';
end $$;

-- Worker: the owner typed in their own chat.
create or replace function public.svc_wa_owner_ask(p_link uuid, p_text text) returns text
language sql stable security definer set search_path = public as $$
  select private.owner_answer(l.workspace_id, p_text) from wa_links l where l.id = p_link
$$;

-- Worker, every minute: the brief text when it's due today (and marks it sent), else null.
create or replace function public.svc_wa_brief_due(p_link uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ws uuid; tz text; bt time; ch text[]; sent date; loc timestamp;
begin
  select l.workspace_id, coalesce(w.timezone, 'Africa/Lagos'), coalesce(w.brief_time, '07:00'), coalesce(w.brief_channels, '{}'), l.brief_sent_on
    into ws, tz, bt, ch, sent from wa_links l join workspaces w on w.id = l.workspace_id where l.id = p_link and l.status = 'connected';
  if ws is null or not ('whatsapp' = any(ch)) then return null; end if;
  loc := now() at time zone tz;
  if loc::time < bt or sent is not distinct from loc::date or loc::time > bt + interval '3 hours' then return null; end if;
  update wa_links set brief_sent_on = loc::date where id = p_link;
  return private.owner_answer(ws, 'brief');
end $$;

revoke execute on function public.svc_wa_owner_ask(uuid, text) from public, anon, authenticated;
revoke execute on function public.svc_wa_brief_due(uuid) from public, anon, authenticated;
grant execute on function public.svc_wa_owner_ask(uuid, text) to service_role;
grant execute on function public.svc_wa_brief_due(uuid) to service_role;
revoke all on function private.owner_answer(uuid, text) from public, anon, authenticated;
