-- Screens refresh by themselves when these change (row-level security still applies to what each person receives).
do $$
declare t text;
begin
  foreach t in array array['orders','order_items','deliveries','payments','payment_events','messages','conversations','contacts','leads','order_contact_attempts','products','complaints','workspace_members','workspaces'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
