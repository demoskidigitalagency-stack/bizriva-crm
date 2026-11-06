-- Bizriva CRM — the AI sales agent on real data (2026-11-06).
--
-- When a customer writes and the chat is handled by the AI, the ai-reply Edge
-- Function reads only this business's catalogue, knowledge base and this
-- customer's orders, asks the model (Anthropic Claude) for a reply, checks it
-- (no prices that aren't in the data), and queues it for WhatsApp — or hands
-- the chat to a person. The business's own API key lives in Vault.

alter table public.conversations
  add column ai_answered_to uuid,            -- last customer message the AI dealt with
  add column ai_claimed_at timestamptz,
  add column ai_error text check (length(ai_error) <= 500);
alter table public.messages add column by_ai boolean not null default false;

create table public.ai_keys (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  provider text not null default 'anthropic' check (provider = 'anthropic'),
  key_secret_id uuid not null,
  model text check (model ~ '^[a-z0-9.-]{3,60}$'),
  saved_by uuid references auth.users(id),
  saved_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text
);
alter table public.ai_keys enable row level security;
create policy "owners and managers see the AI connection" on public.ai_keys for select to authenticated
  using (private.has_role(workspace_id, array['owner','manager']::member_role[]));

create or replace function public.save_ai_key(p_workspace uuid, p_key text, p_model text) returns void
language plpgsql security definer set search_path = public as $$
declare cur ai_keys;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect the AI' using errcode = '42501'; end if;
  if nullif(p_model, '') is not null and p_model !~ '^[a-z0-9.-]{3,60}$' then raise exception 'That model name doesn''t look right'; end if;
  select * into cur from ai_keys where workspace_id = p_workspace;
  if cur is null then
    if coalesce(p_key, '') !~ '^sk-ant-[A-Za-z0-9_-]{20,}$' then raise exception 'Paste an Anthropic API key (it starts with sk-ant-)'; end if;
    insert into ai_keys(workspace_id, key_secret_id, model, saved_by)
      values (p_workspace, vault.create_secret(p_key, 'ai_key_' || p_workspace, 'AI key for workspace ' || p_workspace), nullif(p_model, ''), auth.uid());
  else
    if coalesce(p_key, '') <> '' then
      if p_key !~ '^sk-ant-[A-Za-z0-9_-]{20,}$' then raise exception 'Paste an Anthropic API key (it starts with sk-ant-)'; end if;
      perform vault.update_secret(cur.key_secret_id, p_key);
    end if;
    update ai_keys set model = nullif(p_model, ''), saved_by = auth.uid(), saved_at = now(), last_error = null where workspace_id = p_workspace;
  end if;
end $$;
create or replace function public.remove_ai_key(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur ai_keys;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can disconnect the AI' using errcode = '42501'; end if;
  select * into cur from ai_keys where workspace_id = p_workspace;
  if cur is null then return; end if;
  delete from vault.secrets where id = cur.key_secret_id;
  delete from ai_keys where workspace_id = p_workspace;
end $$;
revoke execute on function public.save_ai_key(uuid, text, text) from public, anon;
grant execute on function public.save_ai_key(uuid, text, text) to authenticated;
revoke execute on function public.remove_ai_key(uuid) from public, anon;
grant execute on function public.remove_ai_key(uuid) to authenticated;

-- Chats waiting for the AI: handled by AI, agent switched on, newest message is the customer's (last 24 hours).
create or replace view private.ai_waiting as
  select c.id as conversation_id, c.workspace_id, lm.id as message_id
  from public.conversations c
  join public.workspaces w on w.id = c.workspace_id
  cross join lateral (select m.id, m.direction, m.created_at from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm
  where c.handled_by = 'ai' and c.status <> 'closed'
    and coalesce((w.settings -> 'agent' ->> 'enabled')::boolean, true)
    and lm.direction = 'in' and lm.created_at > now() - interval '24 hours'
    and c.ai_answered_to is distinct from lm.id;

create or replace function public.svc_ai_claim(p_limit int) returns table(conversation_id uuid, workspace_id uuid, message_id uuid, api_key text, model text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare prev text;
begin
  prev := private.sys_on();
  return query
  with picked as (
    select c.id, wt.message_id from conversations c join private.ai_waiting wt on wt.conversation_id = c.id
    where c.ai_claimed_at is null or c.ai_claimed_at < now() - interval '5 minutes'
    order by c.last_inbound_at nulls last limit least(greatest(p_limit, 1), 20)
    for update of c skip locked
  ), upd as (
    update conversations c set ai_claimed_at = now() from picked where c.id = picked.id returning c.id, c.workspace_id, picked.message_id
  )
  select u.id, u.workspace_id, u.message_id, s.decrypted_secret, k.model
  from upd u left join ai_keys k on k.workspace_id = u.workspace_id left join vault.decrypted_secrets s on s.id = k.key_secret_id;
  perform private.sys_restore(prev);
end $$;

-- Everything the AI may use for one chat — this business only.
create or replace function public.svc_ai_context(p_conversation uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', w.name, 'currency', w.currency,
    'deliveryFee', w.settings -> 'deliveryFee', 'freeDeliveryOver', w.settings -> 'freeDeliveryOver',
    'agent', coalesce(w.settings -> 'agent', '{}'::jsonb),
    'optOutKeywords', coalesce(w.settings -> 'optOutKeywords', '["STOP"]'::jsonb),
    'customer', jsonb_build_object('name', k.name, 'location', k.location),
    'products', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'price', p.price, 'promoPrice', p.promo_price, 'inStock', coalesce(p.stock, 1) > 0,
        'category', p.category, 'description', left(p.description, 400), 'benefits', left(p.benefits, 300)) order by p.name)
      from (select * from products where workspace_id = w.id and active and not restricted_category order by created_at desc limit 80) p), '[]'),
    'knowledge', coalesce((select jsonb_agg(jsonb_build_object('topic', e.topic, 'question', e.question, 'answer', left(e.answer, 800)))
      from (select * from knowledge_entries where workspace_id = w.id order by updated_at desc limit 60) e), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('ref', o.ref, 'status', o.status, 'total', o.total, 'paid', o.amount_paid, 'placed', o.created_at) order by o.created_at desc)
      from (select * from orders where contact_id = k.id order by created_at desc limit 5) o), '[]'),
    'facts', coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'value', f.value)) from contact_facts f where f.contact_id = k.id), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('from', case when m.direction = 'in' then 'customer' else 'business' end, 'text', left(m.body, 1500), 'at', m.created_at) order by m.created_at)
      from (select * from messages where conversation_id = c.id order by created_at desc limit 20) m), '[]')
  )
  from conversations c join workspaces w on w.id = c.workspace_id join contacts k on k.id = c.contact_id
  where c.id = p_conversation;
$$;

-- The AI's answer: queue the reply and/or hand the chat to a person. A newer customer message means it answers again next time.
create or replace function public.svc_ai_result(p_conversation uuid, p_message uuid, p_reply text, p_handoff boolean, p_reason text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; c conversations;
begin
  prev := private.sys_on();
  select * into c from conversations where id = p_conversation;
  if c is null then perform private.sys_restore(prev); return; end if;
  if p_error is not null and not coalesce(p_handoff, false) and coalesce(p_reply, '') = '' then
    update conversations set ai_error = left(p_error, 500) where id = c.id;   -- retried after 5 minutes
    update ai_keys set last_error = left(p_error, 500) where workspace_id = c.workspace_id;
    perform private.sys_restore(prev); return;
  end if;
  if coalesce(btrim(p_reply), '') <> '' and c.handled_by = 'ai' then
    insert into messages(workspace_id, conversation_id, direction, body, status, by_ai) values (c.workspace_id, c.id, 'out', left(btrim(p_reply), 4096), 'queued', true);
  end if;
  update conversations set ai_answered_to = p_message, ai_claimed_at = null, ai_error = null,
    handled_by = case when p_handoff then 'human'::handler else handled_by end, priority = priority or coalesce(p_handoff, false)
  where id = c.id;
  if p_handoff then
    insert into activity_log(workspace_id, entity, entity_id, action, detail) values (c.workspace_id, 'conversation', c.id, 'ai_handoff', jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
  end if;
  update ai_keys set last_used_at = now(), last_error = null where workspace_id = c.workspace_id;
  perform private.sys_restore(prev);
end $$;

-- Lets the webhook wake the AI straight away.
create or replace function public.svc_cron_secret() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret';
$$;

do $$
declare f text;
begin
  foreach f in array array['svc_cron_secret()', 'svc_ai_claim(int)', 'svc_ai_context(uuid)', 'svc_ai_result(uuid, uuid, text, boolean, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on private.ai_waiting from public, anon, authenticated;

-- Catch-up every minute (the webhook also wakes it the moment a message arrives).
select cron.schedule('bizriva-ai-reply', '* * * * *', $job$
  select net.http_post(
    url := 'https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/ai-reply',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bizriva-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'bizriva_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from private.ai_waiting w join public.conversations c on c.id = w.conversation_id where c.ai_claimed_at is null or c.ai_claimed_at < now() - interval '5 minutes')
$job$);

alter publication supabase_realtime add table public.ai_keys;
