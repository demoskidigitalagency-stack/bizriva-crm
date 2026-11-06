-- Fix: the seat limit runs on both members and invites; read user_id only for members.
create or replace function private.limit_seats() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int; uid uuid;
begin
  if tg_table_name = 'workspace_members' then
    uid := (to_jsonb(new) ->> 'user_id')::uuid;
    if exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = uid) then return new; end if;
  end if;
  lim := (private.plan_limits(new.workspace_id)).seats;
  used := (select count(*) from workspace_members where workspace_id = new.workspace_id)
        + case when tg_table_name = 'workspace_invites' then (select count(*) from workspace_invites i where i.workspace_id = new.workspace_id and i.accepted_at is null and i.expires_at > now()) else 0 end;
  if lim is not null and used >= lim then
    raise exception 'Your plan has % team seats and they''re all used — upgrade in Billing to add someone.', lim using errcode = '53400';
  end if;
  return new;
end $$;
