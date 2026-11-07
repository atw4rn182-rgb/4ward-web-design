-- Consultation requests. Separate from customers, onboarding, and quotes
-- so a signup inquiry cannot overwrite an existing customer or payment record.
-- Service role writes from the API. Authenticated admins can read and update.
-- Not applied to production until explicitly approved.

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  city text,
  industry text,
  website_url text,
  preferred_tier text
    check (preferred_tier is null or preferred_tier in ('tier1', 'tier2', 'tier3', 'buyout')),
  project_description text not null,
  contact_method text not null default 'text'
    check (contact_method in ('call', 'text', 'email')),
  contact_time text,
  status text not null default 'received'
    check (status in ('received', 'reviewed', 'contacted', 'closed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultations_email_idx on public.consultations (email);
create index if not exists consultations_status_idx on public.consultations (status);
create index if not exists consultations_created_idx on public.consultations (created_at desc);

drop trigger if exists consultations_set_updated_at on public.consultations;
create trigger consultations_set_updated_at
  before update on public.consultations
  for each row execute function public.set_updated_at();

alter table public.consultations enable row level security;

drop policy if exists consultations_admin_all on public.consultations;
create policy consultations_admin_all
  on public.consultations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
