-- Payment resilience: each checkout attempt carries a unique onboarding_ref in
-- Stripe metadata and in onboarding_submissions.payload. The webhook uses it to
-- rebuild onboarding records missed during a Supabase outage; this index keeps
-- concurrent or replayed deliveries from creating a second row for one ref.
-- Existing rows have no onboarding_ref and are unaffected.

create unique index if not exists onboarding_submissions_onboarding_ref_uidx
  on public.onboarding_submissions ((payload->>'onboarding_ref'))
  where payload ? 'onboarding_ref';
