-- Customer memory, birthday templates and the Morning Money Brief settings (2026-11-05).

create type public.fact_kind as enum ('birthday', 'size', 'likes', 'dislikes', 'budget', 'buys_for', 'note');

create table public.contact_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind public.fact_kind not null,
  value text not null check (length(trim(value)) > 0),
  month_day text check (month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'), -- birthdays: MM-DD, no year kept
  source text not null default 'staff' check (source in ('chat', 'staff', 'ai')),
  quote text, -- the customer's words it came from
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (contact_id, kind, value)
);
create index on public.contact_facts (workspace_id, contact_id);
create index contact_facts_birthdays on public.contact_facts (workspace_id, month_day) where kind = 'birthday';
-- One birthday per person.
create unique index contact_facts_one_birthday on public.contact_facts (contact_id) where kind = 'birthday';

alter table public.contact_facts enable row level security;
create policy "workspace members only" on public.contact_facts for all
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));

alter type public.template_purpose add value if not exists 'birthday';

alter table public.workspaces
  add column brief_time time not null default '07:30',
  add column brief_channels text[] not null default array['app']
    check (brief_channels <@ array['app','whatsapp','email']);
