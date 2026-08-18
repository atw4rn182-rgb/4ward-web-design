-- Quote requests, workflow statuses, and email idempotency tracking.

-- ---------------------------------------------------------------------------
-- Quote requests (custom / one-time work — not website onboarding)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  email text not null,
  phone text,
  company_name text,
  service text not null,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'quoted', 'completed', 'canceled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_requests_email_idx on public.quote_requests (email);
create index if not exists quote_requests_status_idx on public.quote_requests (status);
create index if not exists quote_requests_created_idx on public.quote_requests (created_at desc);

drop trigger if exists quote_requests_set_updated_at on public.quote_requests;
create trigger quote_requests_set_updated_at
  before update on public.quote_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Email idempotency (Stripe webhook retries, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  recipient_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_events_type_idx on public.email_events (event_type);

-- ---------------------------------------------------------------------------
-- Extend customer + onboarding statuses for payment pending workflow
-- ---------------------------------------------------------------------------
alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers
  add constraint customers_status_check
  check (status in ('lead', 'payment_pending', 'active', 'paused', 'churned'));

alter table public.onboarding_submissions drop constraint if exists onboarding_submissions_status_check;
alter table public.onboarding_submissions
  add constraint onboarding_submissions_status_check
  check (status in ('received', 'payment_pending', 'reviewed', 'in_progress', 'completed', 'canceled'));

-- ---------------------------------------------------------------------------
-- RLS — admins only (service role bypasses RLS for API routes)
-- ---------------------------------------------------------------------------
alter table public.quote_requests enable row level security;
alter table public.email_events enable row level security;

drop policy if exists quote_requests_admin_all on public.quote_requests;
create policy quote_requests_admin_all
  on public.quote_requests for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists email_events_admin_all on public.email_events;
create policy email_events_admin_all
  on public.email_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
