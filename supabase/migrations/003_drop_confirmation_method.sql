-- Remove unused SMS/confirmation-method column.
-- Phone remains on customers and onboarding_submissions.

alter table public.onboarding_submissions
  drop column if exists confirmation_method;
