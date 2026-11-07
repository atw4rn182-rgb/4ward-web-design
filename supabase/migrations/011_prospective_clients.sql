-- Prospective clients for a future weekday outreach queue.
-- Dashboard and records only. This migration does not send email,
-- store mailbox credentials, or create a scheduler.
-- Not applied to production until explicitly approved.
-- Existing customer, payment, consultation, quote, and auth tables are untouched.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  city text,
  service_area text,
  industry text,
  website_url text,
  website_host text,
  public_email text,
  secondary_email text,
  research_notes text,
  research_sources text,
  website_opportunities text,
  gbp_observations text,
  researched_at timestamptz,
  research_confidence text
    check (research_confidence is null or research_confidence in ('low', 'medium', 'high')),
  outreach_eligible boolean not null default false,
  status text not null default 'queued'
    check (status in (
      'queued',
      'researching',
      'ready',
      'sent',
      'interested',
      'not_interested',
      'bounced',
      'failed',
      'do_not_contact'
    )),
  source text not null default 'manual'
    check (source in ('manual', 'research')),
  manual_priority boolean not null default false,
  notes text,
  last_activity_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  ready_at timestamptz,
  sent_at timestamptz,
  interested_at timestamptz,
  opted_out_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  do_not_contact_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prospects_name_city_uidx
  on public.prospects (lower(btrim(business_name)), lower(btrim(coalesce(city, ''))));

create unique index if not exists prospects_email_uidx
  on public.prospects (lower(btrim(public_email)))
  where public_email is not null and btrim(public_email) <> '';

create unique index if not exists prospects_website_uidx
  on public.prospects (website_host)
  where website_host is not null and website_host <> '';

create index if not exists prospects_status_idx on public.prospects (status);
create index if not exists prospects_priority_idx
  on public.prospects (manual_priority desc, created_at asc);

create table if not exists public.prospect_activity (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists prospect_activity_prospect_idx
  on public.prospect_activity (prospect_id, created_at desc);

create table if not exists public.prospect_suppressions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete set null,
  business_name text,
  city text,
  email text,
  website_host text,
  reason text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists prospect_suppressions_email_uidx
  on public.prospect_suppressions (lower(btrim(email)))
  where email is not null and btrim(email) <> '';

create unique index if not exists prospect_suppressions_website_uidx
  on public.prospect_suppressions (website_host)
  where website_host is not null and website_host <> '';

create unique index if not exists prospect_suppressions_name_city_uidx
  on public.prospect_suppressions (lower(btrim(business_name)), lower(btrim(coalesce(city, ''))))
  where business_name is not null and btrim(business_name) <> '';

create table if not exists public.outreach_settings (
  id integer primary key default 1 check (id = 1),
  automation_enabled boolean not null default false,
  weekday_target integer not null default 5 check (weekday_target = 5),
  timezone text not null default 'America/Denver' check (timezone = 'America/Denver'),
  send_hour smallint not null default 9 check (send_hour = 9),
  send_minute smallint not null default 0 check (send_minute = 0),
  weekdays smallint[] not null default '{1,2,3,4,5}'
    check (weekdays = array[1, 2, 3, 4, 5]::smallint[]),
  manual_priority boolean not null default true,
  mailing_address text,
  last_run_at timestamptz,
  last_run_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.outreach_settings (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists prospects_set_updated_at on public.prospects;
create trigger prospects_set_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

drop trigger if exists outreach_settings_set_updated_at on public.outreach_settings;
create trigger outreach_settings_set_updated_at
  before update on public.outreach_settings
  for each row execute function public.set_updated_at();

alter table public.prospects enable row level security;
alter table public.prospect_activity enable row level security;
alter table public.prospect_suppressions enable row level security;
alter table public.outreach_settings enable row level security;

drop policy if exists prospects_admin_all on public.prospects;
create policy prospects_admin_all
  on public.prospects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists prospect_activity_admin_all on public.prospect_activity;
create policy prospect_activity_admin_all
  on public.prospect_activity for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists prospect_suppressions_admin_all on public.prospect_suppressions;
create policy prospect_suppressions_admin_all
  on public.prospect_suppressions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists outreach_settings_admin_all on public.outreach_settings;
create policy outreach_settings_admin_all
  on public.outreach_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
