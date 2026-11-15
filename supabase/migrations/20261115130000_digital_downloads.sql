-- Digital downloads (ebooks, courses, templates): a product can carry a file. When an order with
-- such a product is fully paid, the file goes to the customer in their WhatsApp chat (linked number
-- or official WhatsApp) with a thank-you line, once per order. Files live in the private chat-media bucket under <workspace>/digital/.
update storage.buckets set allowed_mime_types = (select array(select distinct x from unnest(allowed_mime_types || array['application/zip', 'application/epub+zip']) x))
  where id = 'chat-media';
alter table public.products add column if not exists digital_path text check (digital_path is null or digital_path ~ '^[0-9a-f-]{36}/digital/');
alter table public.products add column if not exists digital_name text check (digital_name is null or length(digital_name) <= 200);
alter table public.orders add column if not exists digital_sent_at timestamptz;

create or replace function private.deliver_digital() returns trigger
language plpgsql security definer set search_path = public as $$
declare conv uuid; f record; n int := 0; prev text; first text;
begin
  if new.digital_sent_at is not null or coalesce(new.amount_paid, 0) < new.total or new.total <= 0
     or new.status::text in ('cancelled', 'refused', 'returned') then return null; end if;
  if not exists (select 1 from order_items oi join products p on p.id = oi.product_id where oi.order_id = new.id and p.digital_path is not null) then return null; end if;
  select id into conv from conversations where workspace_id = new.workspace_id and contact_id = new.contact_id and channel = 'whatsapp' order by created_at desc limit 1;
  if conv is null then return null; end if;   -- no WhatsApp chat: the team sends it by hand
  prev := private.sys_on();
  select coalesce(nullif(split_part(btrim(name), ' ', 1), ''), 'there') into first from contacts where id = new.contact_id;
  for f in select distinct p.name, p.digital_path, p.digital_name from order_items oi join products p on p.id = oi.product_id
           where oi.order_id = new.id and p.digital_path is not null loop
    insert into messages(workspace_id, conversation_id, direction, status, body, media_path, media_kind, media_name)
      values (new.workspace_id, conv, 'out', 'queued', case when n = 0 then 'Hi ' || first || ', thank you for your payment! Here is ' || f.name || '.' else f.name end,
              f.digital_path, 'document', coalesce(f.digital_name, f.name));
    n := n + 1;
  end loop;
  update orders set digital_sent_at = now() where id = new.id;
  perform private.sys_restore(prev);
  return null;
end $$;
drop trigger if exists deliver_digital on public.orders;
create trigger deliver_digital after insert or update of amount_paid, total, status on public.orders for each row execute function private.deliver_digital();
