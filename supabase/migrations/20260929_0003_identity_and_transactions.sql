-- Identity resolution, order transitions and audit helpers

create or replace function public.resolve_contact_identity(
  p_workspace uuid,
  p_channel text,
  p_external_id text,
  p_phone text default null,
  p_email text default null,
  p_first_name text default 'Unknown',
  p_last_name text default '',
  p_country_code text default null,
  p_city text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_phone text := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email,''))), '');
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;

  if p_external_id is not null then
    select contact_id into v_contact
    from public.channel_identities
    where workspace_id=p_workspace and channel=p_channel and external_id=p_external_id
    limit 1;
  end if;

  if v_contact is null and v_phone is not null then
    select id into v_contact
    from public.contacts
    where workspace_id=p_workspace
      and regexp_replace(coalesce(primary_phone,''), '[^0-9+]', '', 'g')=v_phone
    order by created_at asc
    limit 1;
  end if;

  if v_contact is null and v_email is not null then
    select id into v_contact
    from public.contacts
    where workspace_id=p_workspace and lower(coalesce(primary_email,''))=v_email
    order by created_at asc
    limit 1;
  end if;

  if v_contact is null then
    insert into public.contacts(
      workspace_id, first_name, last_name, primary_phone, primary_email, country_code, city
    ) values (
      p_workspace, coalesce(nullif(trim(p_first_name),''),'Unknown'), coalesce(p_last_name,''),
      v_phone, v_email, p_country_code, p_city
    ) returning id into v_contact;

    insert into public.audit_events(workspace_id, actor_user_id, action, entity_type, entity_id, new_value)
    values(p_workspace, auth.uid(), 'contact.created', 'contact', v_contact,
      jsonb_build_object('source_channel',p_channel,'phone',v_phone,'email',v_email));
  else
    update public.contacts
    set
      primary_phone=coalesce(primary_phone,v_phone),
      primary_email=coalesce(primary_email,v_email),
      country_code=coalesce(country_code,p_country_code),
      city=coalesce(city,p_city),
      updated_at=now()
    where id=v_contact and workspace_id=p_workspace;
  end if;

  if p_external_id is not null then
    insert into public.channel_identities(workspace_id,contact_id,channel,external_id,handle,last_seen_at)
    values(p_workspace,v_contact,p_channel,p_external_id,p_external_id,now())
    on conflict(workspace_id,channel,external_id)
    do update set contact_id=excluded.contact_id,last_seen_at=now();
  end if;

  return v_contact;
end;
$$;

create or replace function public.set_order_state(
  p_workspace uuid,
  p_order uuid,
  p_order_status text default null,
  p_fulfilment_status text default null,
  p_payment_status text default null
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row public.orders;
  after_row public.orders;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;

  select * into before_row from public.orders
  where workspace_id=p_workspace and id=p_order
  for update;
  if before_row.id is null then raise exception 'Order not found'; end if;

  update public.orders set
    order_status=coalesce(p_order_status,order_status),
    fulfilment_status=coalesce(p_fulfilment_status,fulfilment_status),
    payment_status=coalesce(p_payment_status,payment_status),
    updated_at=now()
  where id=p_order and workspace_id=p_workspace
  returning * into after_row;

  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,old_value,new_value)
  values(p_workspace,auth.uid(),'order.state_changed','order',p_order,to_jsonb(before_row),to_jsonb(after_row));

  return after_row;
end;
$$;

create or replace function public.record_cod_collection(
  p_workspace uuid,
  p_order uuid,
  p_delivery uuid,
  p_collector uuid,
  p_amount_minor bigint,
  p_currency text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;
  if p_amount_minor < 0 then raise exception 'Invalid amount'; end if;

  insert into public.cod_liabilities(
    workspace_id,order_id,delivery_id,collector_user_id,expected_minor,collected_minor,remitted_minor,currency,status,collected_at
  )
  select p_workspace,p_order,p_delivery,p_collector,o.total_minor,p_amount_minor,0,p_currency,'collected',now()
  from public.orders o
  where o.workspace_id=p_workspace and o.id=p_order
  returning id into v_id;

  perform public.set_order_state(p_workspace,p_order,null,null,'cod_collected');

  return v_id;
end;
$$;

create or replace function public.verify_remittance(
  p_workspace uuid,
  p_remittance uuid,
  p_verified_minor bigint,
  p_note text default null
) returns public.remittances
language plpgsql
security definer
set search_path = public
as $$
declare out_row public.remittances;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Forbidden'; end if;

  update public.remittances
  set verified_minor=p_verified_minor,
      note=coalesce(p_note,note),
      status=case when p_verified_minor=expected_minor then 'verified' else 'mismatch' end,
      verified_at=now(),
      verified_by_user_id=auth.uid()
  where id=p_remittance and workspace_id=p_workspace
  returning * into out_row;

  if out_row.id is null then raise exception 'Remittance not found'; end if;
  return out_row;
end;
$$;
