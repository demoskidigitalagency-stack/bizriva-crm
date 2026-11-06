-- pg_net belongs outside the public schema (security advisor).
drop extension if exists pg_net;
create extension pg_net schema extensions;
