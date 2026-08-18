-- Preferred domain choices for website onboarding.

alter table public.onboarding_submissions
  add column if not exists domain_preferred text,
  add column if not exists domain_second_choice text,
  add column if not exists domain_third_choice text;

create index if not exists onboarding_submissions_domain_preferred_idx
  on public.onboarding_submissions (domain_preferred)
  where domain_preferred is not null;
