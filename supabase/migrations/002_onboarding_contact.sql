-- Onboarding contact preference (email vs SMS).
-- Phone already exists on customers and onboarding_submissions.
-- Live onboarding currently emails Static Forms and stores contact on the Stripe
-- customer/session; this column is for admin/report storage when submissions
-- are written to Supabase. SMS delivery is not configured yet.

alter table public.onboarding_submissions
  add column if not exists confirmation_method text
  check (confirmation_method is null or confirmation_method in ('email', 'sms'));
