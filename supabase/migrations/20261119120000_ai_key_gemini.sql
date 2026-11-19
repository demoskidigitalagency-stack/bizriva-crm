-- The AI key can be an Anthropic key (sk-ant-…) or a Google Gemini key (AIza…, free tier). The Edge
-- Functions pick the provider from the key (supabase/functions/*/llm.ts).
create or replace function public.save_ai_key(p_workspace uuid, p_key text, p_model text) returns void
language plpgsql security definer set search_path = public as $$
declare cur ai_keys; ok constant text := '^(sk-ant-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,})$';
  msg constant text := 'Paste a Google Gemini key (starts with AIza) or an Anthropic key (starts with sk-ant-)';
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can connect the AI' using errcode = '42501'; end if;
  if nullif(p_model, '') is not null and p_model !~ '^[a-z0-9.-]{3,60}$' then raise exception 'That model name doesn''t look right'; end if;
  select * into cur from ai_keys where workspace_id = p_workspace;
  if cur is null then
    if coalesce(p_key, '') !~ ok then raise exception '%', msg; end if;
    insert into ai_keys(workspace_id, key_secret_id, model, saved_by)
      values (p_workspace, vault.create_secret(p_key, 'ai_key_' || p_workspace, 'AI key for workspace ' || p_workspace), nullif(p_model, ''), auth.uid());
  else
    if coalesce(p_key, '') <> '' then
      if p_key !~ ok then raise exception '%', msg; end if;
      perform vault.update_secret(cur.key_secret_id, p_key);
    end if;
    if not cur.active and coalesce(p_key, '') = '' then raise exception '%', msg; end if;
    update ai_keys set model = nullif(p_model, ''), saved_by = auth.uid(), saved_at = now(), last_error = null, active = true where workspace_id = p_workspace;
  end if;
end $$;
