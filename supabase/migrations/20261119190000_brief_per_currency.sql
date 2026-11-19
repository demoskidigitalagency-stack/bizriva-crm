-- Money Brief, owner assistant and weekly report: totals in the business's currency, other currencies
-- listed after them ("GH₵12,400 + ₦1,300,000"), never added together.
create or replace function private.other_money(ws uuid, d0 date, d1 date, delivered_only boolean default false) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(' + ' || string_agg(private.money_in(x.currency, x.v), ' + ' order by x.currency), '')
  from (select o.currency, sum(o.total) v from orders o, workspaces w
        where o.workspace_id = ws and w.id = ws and o.currency is not null
          and (o.created_at at time zone coalesce(w.timezone, 'Africa/Lagos'))::date between d0 and d1
          and case when delivered_only then o.status = 'delivered' else o.status::text not in ('cancelled','refused','returned') end
        group by o.currency) x;
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('private.owner_answer(uuid, text)'::regprocedure);
  d := replace(d, 'coalesce(sum(total), 0)', 'coalesce(sum(total) filter (where currency is null), 0)');
  d := replace(d, 'coalesce(sum(o.total), 0)', 'coalesce(sum(o.total) filter (where o.currency is null), 0)');
  d := replace(d, 'coalesce(sum(amount_paid), 0)', 'coalesce(sum(amount_paid) filter (where currency is null), 0)');
  d := replace(d, 'Yesterday: %s order%s, %s'', to_char(today, ''Dy DD Mon''), n, case when n = 1 then '''' else ''s'' end, private.money_fmt(ws, v))',
                  'Yesterday: %s order%s, %s%s'', to_char(today, ''Dy DD Mon''), n, case when n = 1 then '''' else ''s'' end, private.money_fmt(ws, v), private.other_money(ws, d0, d0))');
  d := replace(d, 'E''\nDelivered this month: '' || private.money_fmt(ws, v)', 'E''\nDelivered this month: '' || private.money_fmt(ws, v) || private.other_money(ws, date_trunc(''month'', today)::date, today, true)');
  d := replace(d, 'format(''%s: %s order%s worth %s, %s paid so far.'', label, n, case when n = 1 then '''' else ''s'' end, private.money_fmt(ws, v), private.money_fmt(ws, v2))',
                  'format(''%s: %s order%s worth %s%s, %s paid so far.'', label, n, case when n = 1 then '''' else ''s'' end, private.money_fmt(ws, v), private.other_money(ws, d0, d1), private.money_fmt(ws, v2))');
  execute d;
  d := pg_get_functiondef('private.week_report(uuid)'::regprocedure);
  d := replace(d, 'coalesce(sum(total), 0)', 'coalesce(sum(total) filter (where currency is null), 0)');
  d := replace(d, 'Orders: %s worth %s (week before: %s, %s)'', n, private.money_fmt(ws, v), n2, private.money_fmt(ws, v2))',
                  'Orders: %s worth %s%s (week before: %s, %s)'', n, private.money_fmt(ws, v), private.other_money(ws, d0, today - 1), n2, private.money_fmt(ws, v2))');
  execute d;
end $$;
