-- Termii gives each account its own API address (shown on the Termii dashboard). The owner can set it; default https://v3.api.termii.com.
create or replace function public.set_sms_address(p_workspace uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare u text := rtrim(btrim(coalesce(p_url, '')), '/'); prev text;
begin
  if not private.has_role(p_workspace, array['owner']::member_role[]) then raise exception 'Only the owner can change SMS' using errcode = '42501'; end if;
  if u <> '' and u !~* '^https://[a-z0-9.-]+\.termii\.com$' then raise exception 'Use the API address from your Termii dashboard, like https://v3.api.termii.com'; end if;
  prev := private.sys_on();
  update workspaces set sms_settings = case when u = '' then sms_settings - 'base_url' else sms_settings || jsonb_build_object('base_url', lower(u)) end where id = p_workspace;
  perform private.sys_restore(prev);
end $$;
revoke execute on function public.set_sms_address(uuid, text) from public, anon;
grant execute on function public.set_sms_address(uuid, text) to authenticated;
