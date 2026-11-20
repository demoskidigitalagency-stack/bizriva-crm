-- Bookkeeping: expenses and a monthly profit and loss.
--   Sales        delivered orders that month (cash basis for pay-on-delivery: only delivered counts)
--   Cost of goods  products' cost × quantity on those orders
--   Expenses     what the owner records (rent, ads, transport, stock, salaries…)
--   Profit       sales − cost of goods − expenses
-- Each currency separately; nothing is converted.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  spent_on date not null default current_date,
  category text not null default 'Other' check (length(category) between 1 and 40),
  amount numeric not null check (amount > 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  note text check (length(note) <= 300),
  paid_to text check (length(paid_to) <= 80),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists expenses_ws_date on public.expenses (workspace_id, spent_on);
alter table public.expenses enable row level security;
create policy "owners managers finance see expenses" on public.expenses for select using (private.has_role(workspace_id, array['owner','manager','finance']::member_role[]));
create policy "owners managers finance edit expenses" on public.expenses for all
  using (private.has_role(workspace_id, array['owner','manager','finance']::member_role[])) with check (private.has_role(workspace_id, array['owner','manager','finance']::member_role[]));
grant select, insert, update, delete on public.expenses to authenticated;

create or replace function public.profit_and_loss(p_workspace uuid, p_months int default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare main text; tz text; out jsonb;
begin
  if not private.has_role(p_workspace, array['owner','manager','finance']::member_role[]) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select currency, coalesce(timezone, 'Africa/Lagos') into main, tz from workspaces where id = p_workspace;
  with months as (
    select to_char(d, 'YYYY-MM') m from generate_series(date_trunc('month', now() at time zone tz) - make_interval(months => greatest(1, least(p_months, 24)) - 1), date_trunc('month', now() at time zone tz), interval '1 month') d
  ), sales as (
    select to_char(o.created_at at time zone tz, 'YYYY-MM') m, coalesce(o.currency, main) cur, sum(o.total) total, count(*) n,
      sum((select coalesce(sum(oi.quantity * coalesce(p.cost, 0)), 0) from order_items oi join products p on p.id = oi.product_id where oi.order_id = o.id)) cogs
    from orders o where o.workspace_id = p_workspace and o.status = 'delivered' group by 1, 2
  ), spend as (
    select e.m, e.cur, sum(e.amt) total, jsonb_object_agg(e.category, e.amt) by_cat
    from (select to_char(spent_on, 'YYYY-MM') m, coalesce(currency, main) cur, category, sum(amount) amt
          from expenses where workspace_id = p_workspace group by 1, 2, 3) e group by 1, 2
  ), curs as (select cur from sales union select cur from spend union select main)
  select coalesce(jsonb_agg(jsonb_build_object('month', months.m, 'currency', curs.cur,
      'sales', coalesce(s.total, 0), 'orders', coalesce(s.n, 0), 'cogs', coalesce(s.cogs, 0), 'expenses', coalesce(x.total, 0), 'byCategory', coalesce(x.by_cat, '{}'),
      'profit', coalesce(s.total, 0) - coalesce(s.cogs, 0) - coalesce(x.total, 0)) order by months.m desc, curs.cur <> main, curs.cur), '[]')
    into out
  from months cross join curs left join sales s on s.m = months.m and s.cur = curs.cur left join spend x on x.m = months.m and x.cur = curs.cur
  where curs.cur = main or s.total is not null or x.total is not null;
  return out;
end $$;
grant execute on function public.profit_and_loss(uuid, int) to authenticated;
