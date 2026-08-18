-- Quote management: expanded workflow, pricing, payment, and internal notes.

alter table public.quote_requests
  add column if not exists quantity text,
  add column if not exists quoted_amount_cents integer
    check (quoted_amount_cents is null or quoted_amount_cents >= 0),
  add column if not exists currency text not null default 'usd',
  add column if not exists payment_status text not null default 'none'
    check (payment_status in ('none', 'awaiting_payment', 'pending', 'paid', 'failed', 'canceled', 'refunded')),
  add column if not exists internal_notes text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_payment_link_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists quote_sent_at timestamptz,
  add column if not exists paid_at timestamptz;

update public.quote_requests
set status = 'quote_sent'
where status = 'quoted';

alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests
  add constraint quote_requests_status_check
  check (status in (
    'new',
    'reviewing',
    'quote_preparing',
    'quote_sent',
    'awaiting_payment',
    'paid',
    'in_progress',
    'completed',
    'canceled'
  ));

create index if not exists quote_requests_payment_status_idx
  on public.quote_requests (payment_status);

create unique index if not exists quote_requests_stripe_session_uidx
  on public.quote_requests (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
