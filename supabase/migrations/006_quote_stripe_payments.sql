-- Quote Stripe payment links and payment record linkage.

alter table public.quote_requests
  add column if not exists stripe_payment_url text;

alter table public.payments
  add column if not exists quote_request_id uuid references public.quote_requests (id) on delete set null;

create index if not exists payments_quote_request_idx
  on public.payments (quote_request_id)
  where quote_request_id is not null;

alter table public.payments drop constraint if exists payments_payment_type_check;
alter table public.payments
  add constraint payments_payment_type_check
  check (payment_type in ('subscription', 'one_time', 'buyout', 'addon', 'quote', 'other'));
