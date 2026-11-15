-- AI tools on the business's own key (ai-tools Edge Function: photo to product, ad copy, customer
-- memory), voice-note transcripts from the WhatsApp worker (OpenAI speech-to-text when the server
-- has OPENAI_API_KEY), and the weekly report in the owner's WhatsApp chat (Mondays with the brief,
-- or "weekly report" any time).
create or replace function public.svc_ai_tools_key(p_user uuid, p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare key text; model text;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_workspace and user_id = p_user) then return jsonb_build_object('error', 'Not allowed'); end if;
  select nullif(s.decrypted_secret, ''), k.model into key, model from ai_keys k join vault.decrypted_secrets s on s.id = k.key_secret_id where k.workspace_id = p_workspace and k.active;
  return jsonb_build_object('api_key', key, 'model', model);
end $$;
revoke execute on function public.svc_ai_tools_key(uuid, uuid) from public, anon, authenticated;
grant execute on function public.svc_ai_tools_key(uuid, uuid) to service_role;

create or replace function public.svc_wa_transcript(p_link uuid, p_message uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid; conv uuid; prev text;
begin
  select workspace_id into ws from wa_links where id = p_link;
  if ws is null or nullif(btrim(p_text), '') is null then return; end if;
  prev := private.sys_on();
  update messages set body = '[voice note: ' || left(btrim(p_text), 3000) || ']'
    where id = p_message and workspace_id = ws and direction = 'in' and body like '[voice note]%' returning conversation_id into conv;
  if conv is not null then update conversations set ai_answered_to = null where id = conv and ai_answered_to = p_message; end if;
  perform private.sys_restore(prev);
end $$;
revoke execute on function public.svc_wa_transcript(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_wa_transcript(uuid, uuid, text) to service_role;

create or replace function private.week_report(ws uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare tz text := coalesce((select timezone from workspaces where id = ws), 'Africa/Lagos');
  today date := (now() at time zone tz)::date; d0 date := today - 7; n int; v numeric; n2 int; v2 numeric; top text; chats int; r text;
begin
  select count(*), coalesce(sum(total), 0) into n, v from orders where workspace_id = ws and (created_at at time zone tz)::date between d0 and today - 1 and status::text not in ('cancelled','refused','returned');
  select count(*), coalesce(sum(total), 0) into n2, v2 from orders where workspace_id = ws and (created_at at time zone tz)::date between d0 - 7 and d0 - 1 and status::text not in ('cancelled','refused','returned');
  select string_agg(x.name || ' (' || x.q || ')', ', ') into top from (
    select p.name, sum(oi.quantity) q from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
    where o.workspace_id = ws and (o.created_at at time zone tz)::date between d0 and today - 1 and o.status::text not in ('cancelled','refused','returned')
    group by p.name order by 2 desc limit 3) x;
  select count(*) into chats from (select c.contact_id from conversations c join messages m on m.conversation_id = c.id where c.workspace_id = ws group by c.contact_id having (min(m.created_at) at time zone tz)::date between d0 and today - 1) x;
  r := format(E'*Last 7 days*\nOrders: %s worth %s (week before: %s, %s)', n, private.money_fmt(ws, v), n2, private.money_fmt(ws, v2));
  if top is not null then r := r || E'\nTop products: ' || top; end if;
  r := r || E'\nNew chats: ' || chats;
  select count(*) into n from orders where workspace_id = ws and status = 'delivered' and (created_at at time zone tz)::date between d0 and today - 1;
  r := r || E'\nDelivered: ' || n;
  return r;
end $$;
revoke all on function private.week_report(uuid) from public, anon, authenticated;

do $$ declare d text := pg_get_functiondef('private.owner_answer(uuid,text)'::regprocedure);
begin
  if position('week_report' in d) = 0 then
    d := replace(d, $x$  if t ~ '(brief|morning|summary|report)' then$x$, $x$  if t ~ '(week(ly)? report|last week|this week report)' then return private.week_report(ws); end if;
  if t ~ '(brief|morning|summary|report)' then$x$);
    d := replace(d, $x$    return r || E'\n\nReply "help" for what else you can ask.';$x$, $x$    if extract(isodow from today) = 1 then r := r || E'\n\n' || private.week_report(ws); end if;
    return r || E'\n\nReply "help" for what else you can ask.';$x$);
    d := replace(d, $x$• brief';$x$, $x$• brief\n• weekly report';$x$);
    execute d;
  end if;
end $$;
