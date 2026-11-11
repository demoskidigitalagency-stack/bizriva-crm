-- A Meta app secret is 32 letters a–f and digits; catch a wrong paste before it breaks sign-ups.
create or replace function public.admin_set_meta(p_app_id text, p_config_id text, p_app_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare cur private.platform_meta; sec text := lower(btrim(coalesce(p_app_secret, '')));
begin
  if not private.is_platform_admin() then raise exception 'Super Admin only' using errcode = '42501'; end if;
  if coalesce(p_app_id, '') !~ '^\d{6,25}$' then raise exception 'The App ID is the long number at the top of your Meta app'; end if;
  if coalesce(p_config_id, '') !~ '^\d{6,25}$' then raise exception 'The configuration ID is the long number from WhatsApp → Embedded Signup (Facebook Login for Business → Configurations)'; end if;
  select * into cur from private.platform_meta where id;
  if cur.app_secret_id is null and sec = '' then raise exception 'Add the app secret (App settings → Basic)'; end if;
  if sec <> '' and sec !~ '^[0-9a-f]{32}$' then raise exception 'That isn''t the app secret — it''s 32 letters and numbers, shown after clicking Show next to App secret in App settings → Basic'; end if;
  if sec <> '' then
    if cur.app_secret_id is null then
      update private.platform_meta set app_secret_id = vault.create_secret(sec, 'bizriva_meta_app_secret', 'Bizriva Meta app secret') where id;
    else perform vault.update_secret(cur.app_secret_id, sec); end if;
  end if;
  update private.platform_meta set app_id = p_app_id, config_id = p_config_id, updated_at = now(), updated_by = auth.uid() where id;
end $$;
