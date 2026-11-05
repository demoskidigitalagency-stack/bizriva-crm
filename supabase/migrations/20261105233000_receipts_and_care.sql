-- Receipts and "how to use and care" guides after delivery (2026-11-05).
alter table public.products add column care_guide text;
alter table public.workspaces add column after_delivery jsonb not null default '{"receipt": true, "careGuide": true}'::jsonb;
alter table public.orders add column receipt_no text;
create unique index orders_receipt_no on public.orders (workspace_id, receipt_no) where receipt_no is not null;
