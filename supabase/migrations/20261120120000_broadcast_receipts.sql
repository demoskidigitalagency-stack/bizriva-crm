-- WhatsApp broadcast results: delivered/read receipts on a broadcast message are copied to its
-- recipient row; campaign_results adds went_out / waiting / failed; recipients link to their message.
create or replace function private.broadcast_receipts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status::text in ('delivered', 'read') and new.status is distinct from old.status then
    update campaign_recipients set delivered_at = coalesce(delivered_at, now()),
      opened_at = case when new.status::text = 'read' then coalesce(opened_at, now()) else opened_at end
    where message_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists broadcast_receipts on public.messages;
create trigger broadcast_receipts after update of status on public.messages for each row when (new.direction = 'out') execute function private.broadcast_receipts();

create or replace view public.campaign_results with (security_invoker = true) as
  select c.id as campaign_id, c.workspace_id, c.name, c.channel, c.sent_at, count(r.*) as recipients,
    count(r.delivered_at) as delivered, count(r.opened_at) as opened, count(r.clicked_at) as clicked, count(r.order_id) as orders,
    coalesce(sum(o.total) filter (where o.status = 'delivered'::order_status), 0::numeric) as delivered_revenue,
    count(r.replied_at) as replied,
    count(*) filter (where m.status::text in ('sent', 'delivered', 'read')) as went_out,
    count(*) filter (where m.status::text in ('queued', 'sending')) as waiting,
    count(*) filter (where m.status::text = 'failed') as failed
  from campaigns c left join campaign_recipients r on r.campaign_id = c.id left join orders o on o.id = r.order_id left join messages m on m.id = r.message_id
  group by c.id;

alter table public.campaign_recipients drop constraint if exists campaign_recipients_message_id_fkey;
alter table public.campaign_recipients add constraint campaign_recipients_message_id_fkey foreign key (message_id) references public.messages(id) on delete set null not valid;
