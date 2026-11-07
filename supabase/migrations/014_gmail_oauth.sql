-- Store one encrypted Gmail refresh token on the existing outreach_settings row.
-- Prepared for approval. Do not apply until approved.
-- This does not send email, enable the scheduler, or change customers,
-- payments, consultations, or Supabase authentication.
-- The plaintext token is never stored. The encryption key stays in hosting.

alter table public.outreach_settings
  add column if not exists gmail_email text,
  add column if not exists gmail_refresh_token text,
  add column if not exists gmail_connected_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_settings_gmail_email_check'
  ) then
    alter table public.outreach_settings
      add constraint outreach_settings_gmail_email_check
      check (gmail_email is null or gmail_email = '4wardwebdesigns@gmail.com');
  end if;
end $$;

comment on column public.outreach_settings.gmail_refresh_token is
  'AES-256-GCM ciphertext for the Gmail refresh token. The key is not stored in the database.';

revoke select on table public.outreach_settings from anon, authenticated;
revoke update on table public.outreach_settings from anon, authenticated;

grant select (
  id,
  automation_enabled,
  weekday_target,
  timezone,
  send_hour,
  send_minute,
  weekdays,
  manual_priority,
  mailing_address,
  last_run_at,
  last_run_summary,
  updated_at,
  gmail_email,
  gmail_connected_at
) on table public.outreach_settings to authenticated;

grant update (
  automation_enabled,
  weekday_target,
  manual_priority,
  mailing_address
) on table public.outreach_settings to authenticated;
