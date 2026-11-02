# Database tests

`tenant_isolation.sql` proves one workspace can't read or write another's data.

On Supabase, `auth.users` and `auth.uid()` already exist. On a plain local Postgres, create stand-ins first:

```sql
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
```

Then run the migration and the test:

```bash
psql -d scratch -f supabase/migrations/20261102000000_foundation.sql
psql -d scratch -f supabase/tests/tenant_isolation.sql
```

Last run (2026-11-02, Postgres 16): user A saw only Shop A, user B saw only Shop B, and the cross-workspace insert was refused.
