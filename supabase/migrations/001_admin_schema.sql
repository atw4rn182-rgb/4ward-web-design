-- 4Ward Web Design — Admin schema
-- Run in Supabase SQL Editor (or via CLI migrations).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Admin allow-list: only these authenticated users can access admin data
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  website_url text,
  city text,
  state text default 'NM',
  status text not null default 'lead'
    check (status in ('lead', 'active', 'paused', 'churned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_status_idx on public.customers (status);

-- ---------------------------------------------------------------------------
-- Onboarding submissions
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  tier text not null,
  company_name text,
  contact_name text,
  email text,
  phone text,
  website_url text,
  notes text,
  agreement_accepted boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'reviewed', 'in_progress', 'completed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_submissions_customer_idx
  on public.onboarding_submissions (customer_id);
create index if not exists onboarding_submissions_status_idx
  on public.onboarding_submissions (status);

-- ---------------------------------------------------------------------------
-- Uploaded files (metadata; binary objects live in Supabase Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  onboarding_submission_id uuid references public.onboarding_submissions (id) on delete set null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  kind text not null default 'other'
    check (kind in ('logo', 'brand', 'document', 'image', 'other')),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists uploaded_files_customer_idx
  on public.uploaded_files (customer_id);

-- ---------------------------------------------------------------------------
-- Website projects
-- ---------------------------------------------------------------------------
create table if not exists public.website_projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  tier text,
  status text not null default 'intake'
    check (status in ('intake', 'design', 'development', 'review', 'live', 'archived')),
  live_url text,
  staging_url text,
  started_at date,
  launched_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_projects_customer_idx
  on public.website_projects (customer_id);
create index if not exists website_projects_status_idx
  on public.website_projects (status);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  website_project_id uuid references public.website_projects (id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  payment_type text not null default 'subscription'
    check (payment_type in ('subscription', 'one_time', 'buyout', 'addon', 'other')),
  tier text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  description text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_customer_idx on public.payments (customer_id);
create index if not exists payments_status_idx on public.payments (status);
create unique index if not exists payments_stripe_session_uidx
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  website_project_id uuid references public.website_projects (id) on delete cascade,
  onboarding_submission_id uuid references public.onboarding_submissions (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_has_target check (
    customer_id is not null
    or website_project_id is not null
    or onboarding_submission_id is not null
  )
);

create index if not exists notes_customer_idx on public.notes (customer_id);
create index if not exists notes_project_idx on public.notes (website_project_id);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists onboarding_submissions_set_updated_at on public.onboarding_submissions;
create trigger onboarding_submissions_set_updated_at
  before update on public.onboarding_submissions
  for each row execute function public.set_updated_at();

drop trigger if exists website_projects_set_updated_at on public.website_projects;
create trigger website_projects_set_updated_at
  before update on public.website_projects
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — admins only
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.customers enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.website_projects enable row level security;
alter table public.payments enable row level security;
alter table public.notes enable row level security;

-- Admin users can read their own allow-list row (needed for is_admin checks via client)
drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists admin_users_manage on public.admin_users;
create policy admin_users_manage
  on public.admin_users for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists customers_admin_all on public.customers;
create policy customers_admin_all
  on public.customers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists onboarding_admin_all on public.onboarding_submissions;
create policy onboarding_admin_all
  on public.onboarding_submissions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists uploaded_files_admin_all on public.uploaded_files;
create policy uploaded_files_admin_all
  on public.uploaded_files for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists website_projects_admin_all on public.website_projects;
create policy website_projects_admin_all
  on public.website_projects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all
  on public.payments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notes_admin_all on public.notes;
create policy notes_admin_all
  on public.notes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- After creating your first Auth user in Supabase Dashboard, promote them:
--   insert into public.admin_users (user_id, email, full_name)
--   values ('USER_UUID_HERE', 'you@example.com', 'Admin Name');
-- ---------------------------------------------------------------------------
