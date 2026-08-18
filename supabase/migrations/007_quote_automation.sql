-- Quote automation: email delivery tracking and admin-visible failures.

alter table public.email_events
  add column if not exists status text not null default 'sent'
    check (status in ('sent', 'failed')),
  add column if not exists error_message text,
  add column if not exists quote_request_id uuid references public.quote_requests (id) on delete set null;

create index if not exists email_events_quote_request_idx
  on public.email_events (quote_request_id)
  where quote_request_id is not null;

create index if not exists email_events_status_idx
  on public.email_events (status)
  where status = 'failed';

alter table public.quote_requests
  add column if not exists payment_link_sent_at timestamptz,
  add column if not exists last_email_error text,
  add column if not exists last_email_error_at timestamptz,
  add column if not exists last_email_error_type text;
