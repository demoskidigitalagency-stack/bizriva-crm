# Pending migrations

Written but **not yet applied** to the live database (they're waiting for the owner's approval).
When one is applied, it moves to `supabase/migrations/` with the same file name.

- `20261106230000_order_edit.sql` — edit or cancel an order before it ships (replaces the order's items, so it asks for approval).
