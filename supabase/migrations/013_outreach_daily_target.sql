-- Allow the weekday outreach target to be 1 through 10.
-- Prepared for approval. Do not apply until approved.
-- This does not send email, create a schedule, or change customers,
-- payments, consultations, or authentication.
-- The existing single outreach_settings row is kept. The default remains 5.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'outreach_settings'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%weekday_target%';

  if constraint_name is not null then
    execute format('alter table public.outreach_settings drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.outreach_settings
  add constraint outreach_settings_weekday_target_check
  check (weekday_target >= 1 and weekday_target <= 10);
