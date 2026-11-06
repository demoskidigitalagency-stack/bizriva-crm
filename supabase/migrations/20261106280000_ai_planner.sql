-- Bizriva CRM — AI workflow planner on our own AI key (2026-11-06).
--
-- Staff describe a goal ("win back customers who haven't ordered in 60 days");
-- the ai-planner function asks Claude for a step-by-step plan grounded in this
-- business's real numbers (counts only — never names, phones or messages).
-- It uses the business's own Anthropic key when they've added one, otherwise
-- Bizriva's (ANTHROPIC_API_KEY). 20 plans a day per business; paused with the AI when the plan has ended.

create table public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal text not null,
  plan jsonb,
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.ai_plans enable row level security;
create policy "team sees its AI plans" on public.ai_plans for select using (private.is_member(workspace_id));
create index on public.ai_plans (workspace_id, created_at desc);

-- May this person plan now? Returns the business's own AI key (or null = use Bizriva's) and the numbers to plan with.
create or replace function public.svc_planner_start(p_user uuid, p_workspace uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w workspaces; key text; model text; snap text; ccy text;
begin
  select * into w from workspaces where id = p_workspace;
  if w.id is null or not exists (select 1 from workspace_members where workspace_id = p_workspace and user_id = p_user) then return jsonb_build_object('error', 'Not your business'); end if;
  if not private.plan_active(p_workspace) then return jsonb_build_object('error', 'Your trial or plan has ended — choose a plan in Billing to use the AI planner.'); end if;
  if (select count(*) from ai_plans where workspace_id = p_workspace and created_at > now() - interval '24 hours') >= 20 then
    return jsonb_build_object('error', 'You''ve made 20 plans in the last 24 hours — try again tomorrow.');
  end if;
  select nullif(s.decrypted_secret, ''), k.model into key, model from ai_keys k join vault.decrypted_secrets s on s.id = k.key_secret_id where k.workspace_id = p_workspace and k.active;
  ccy := coalesce(w.currency, 'NGN');
  snap := concat_ws(E'\n',
    format('Business: %s — sells with pay on delivery in Nigeria, currency %s.', w.name, ccy),
    format('Team: %s.', (select string_agg(role::text || ' ' || n, ', ') from (select role, count(*) n from workspace_members where workspace_id = w.id group by role) r)),
    format('Customers: %s. With marketing consent: %s. Opted out: %s.', (select count(*) from contacts where workspace_id = w.id),
      (select count(*) from contacts ct where ct.workspace_id = w.id and (select s.granted from consents s where s.contact_id = ct.id and s.category = 'marketing' order by s.recorded_at desc limit 1) is true),
      (select count(*) from contacts ct where ct.workspace_id = w.id and private.opted_out(ct.id))),
    format('Leads by stage: %s.', coalesce((select string_agg(stage::text || ' ' || n, ', ') from (select stage, count(*) n from leads where workspace_id = w.id group by stage) s), 'none')),
    format('Chats waiting for a reply: %s. Chats with a person (not the AI): %s.',
      (select count(*) from conversations c where c.workspace_id = w.id and c.status <> 'closed' and (select m.direction from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) = 'in'),
      (select count(*) from conversations where workspace_id = w.id and handled_by = 'human' and status <> 'closed')),
    format('Orders last 30 days: %s (%s delivered, %s cancelled/refused/returned). Waiting for confirmation now: %s. Ready to dispatch: %s.',
      (select count(*) from orders where workspace_id = w.id and created_at > now() - interval '30 days'),
      (select count(*) from orders where workspace_id = w.id and created_at > now() - interval '30 days' and status = 'delivered'),
      (select count(*) from orders where workspace_id = w.id and created_at > now() - interval '30 days' and status in ('cancelled', 'refused', 'returned')),
      (select count(*) from orders where workspace_id = w.id and status = 'pending_verification'),
      (select count(*) from orders where workspace_id = w.id and status = 'ready_for_dispatch')),
    format('Delivered revenue last 30 days: %s %s. High-risk COD orders waiting: %s.', ccy,
      (select coalesce(sum(total), 0) from orders where workspace_id = w.id and status = 'delivered' and created_at > now() - interval '30 days'),
      (select count(*) from orders where workspace_id = w.id and status = 'pending_verification' and risk_level = 'high')),
    format('Customers who ordered before but not in the last 60 days: %s.',
      (select count(distinct o.contact_id) from orders o where o.workspace_id = w.id and o.status = 'delivered'
        and not exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.created_at > now() - interval '60 days'))),
    format('Failed or rescheduled deliveries open: %s. Open tasks past due: %s.',
      (select count(*) from deliveries d join orders o on o.id = d.order_id where o.workspace_id = w.id and d.outcome in ('unreachable', 'rescheduled') and o.status not in ('delivered', 'cancelled', 'returned', 'refused')),
      (select count(*) from tasks where workspace_id = w.id and status = 'open' and due_at < now())),
    format('Products: %s active; low stock: %s.', (select count(*) from products where workspace_id = w.id and active),
      coalesce((select string_agg(name || ' (' || stock || ' left)', '; ') from (select name, stock from products where workspace_id = w.id and active and stock is not null and stock <= coalesce(reorder_level, 5) limit 8) p), 'none')),
    format('Top products (last 90 days): %s.', coalesce((select string_agg(name || ' ×' || n, '; ') from (select p.name, sum(i.quantity) n from order_items i join orders o on o.id = i.order_id join products p on p.id = i.product_id
        where o.workspace_id = w.id and o.created_at > now() - interval '90 days' group by p.name order by 2 desc limit 5) t), 'none yet')),
    format('Approved WhatsApp templates: %s. Follow-up rules on: %s. Channels connected: %s.',
      coalesce((select string_agg(name, ', ') from message_templates where workspace_id = w.id and status = 'approved'), 'none'),
      (select count(*) from followup_rules where workspace_id = w.id and enabled),
      concat_ws(', ', case when exists (select 1 from whatsapp_numbers where workspace_id = w.id and active) then 'WhatsApp' end,
        case when exists (select 1 from meta_pages where workspace_id = w.id and active) then 'Messenger/Instagram' end,
        case when w.webchat_key is not null then 'website chat' end, case when w.sms_settings ->> 'provider' = 'termii' then 'SMS' end,
        case when coalesce(w.email_settings ->> 'provider', 'none') <> 'none' then 'email' end)));
  return jsonb_build_object('ok', true, 'api_key', key, 'model', model, 'snapshot', snap);
end $$;

create or replace function public.svc_planner_save(p_user uuid, p_workspace uuid, p_goal text, p_plan jsonb, p_error text) returns uuid
language sql security definer set search_path = public as $$
  insert into ai_plans(workspace_id, goal, plan, error, created_by) values (p_workspace, left(p_goal, 2000), p_plan, left(p_error, 500), p_user) returning id;
$$;

do $$
declare f text;
begin
  foreach f in array array['svc_planner_start(uuid, uuid)', 'svc_planner_save(uuid, uuid, text, jsonb, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
