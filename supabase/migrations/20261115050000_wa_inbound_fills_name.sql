-- A customer we already have but never named: take their WhatsApp profile name from the
-- next message they send (history sync rarely carries it). Never overwrites a name.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.svc_whatsapp_inbound(uuid,text,text,text,text,text,timestamptz)'::regprocedure);
  if position('fill a missing name' in src) = 0 then
    src := replace(src,
      E'  select id into conv from conversations',
      E'  -- fill a missing name from the WhatsApp profile name\n  if nullif(btrim(coalesce(p_name, '''')), '''') is not null then\n    update contacts set name = left(btrim(p_name), 120), updated_at = now() where id = cid and nullif(btrim(coalesce(name, '''')), '''') is null;\n  end if;\n  select id into conv from conversations');
    execute src;
  end if;
end $$;
