-- Core CRM completeness: attribution, opportunities, product interests, notes and files

create table if not exists public.acquisition_attributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source text not null,
  campaign text,
  ad_set text,
  creative text,
  first_touch_channel text,
  landed_at timestamptz not null default now(),
  is_first_touch boolean not null default false,
  is_last_touch boolean not null default false
);
create index if not exists acquisition_attributions_contact_idx
  on public.acquisition_attributions(workspace_id, contact_id, landed_at desc);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  value_minor bigint not null default 0,
  currency text not null default 'NGN',
  stage text not null default 'new_lead',
  probability integer not null default 0 check (probability between 0 and 100),
  status text not null default 'open',
  expected_close_at timestamptz,
  owner_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_workspace_stage_idx
  on public.opportunities(workspace_id, stage, status);

create table if not exists public.product_interests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  category text,
  intent text not null default 'browsing',
  source text,
  captured_at timestamptz not null default now()
);
create index if not exists product_interests_contact_idx
  on public.product_interests(workspace_id, contact_id, captured_at desc);

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  author_user_id uuid references auth.users(id),
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  uploaded_by_user_id uuid references auth.users(id),
  storage_bucket text not null default 'crm-files',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_tags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag)
);

do $$
declare t text;
begin
  foreach t in array array[
    'acquisition_attributions','opportunities','product_interests',
    'contact_notes','contact_files','contact_tags'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "workspace members select %1$s" on public.%1$I for select using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members insert %1$s" on public.%1$I for insert with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members update %1$s" on public.%1$I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "workspace members delete %1$s" on public.%1$I for delete using (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;
