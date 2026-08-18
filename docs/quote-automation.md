# Quote automation — status transitions & automated actions

Custom quote projects are managed from the **Admin → Quotes** dashboard. They are intentionally separate from fixed-tier **website onboarding / subscription** checkout (`metadata.kind = quote_payment` vs tier checkout).

## Workflow statuses

| Status | Meaning | Typical trigger |
|--------|---------|-----------------|
| `new` | Customer submitted the quote form | Automatic on `/api/quote-request` |
| `reviewing` | Admin is reviewing the request | Manual (Save quote) |
| `quote_preparing` | Pricing / vendor research in progress | Manual |
| `quote_sent` | Quote communicated (optional manual step) | Manual |
| `awaiting_payment` | Payment link generated and/or sent; waiting on Stripe | **Automatic** on generate link or send payment email |
| `paid` | Stripe confirmed payment | **Automatic** via webhook only |
| `in_progress` | Work started after payment | Manual |
| `completed` | Project delivered | Manual |
| `canceled` | Quote canceled | Manual |

## Payment statuses

| Payment status | Meaning |
|----------------|---------|
| `none` | No payment activity yet |
| `awaiting_payment` | Payment request sent to customer |
| `pending` | Stripe payment link active; checkout not completed |
| `paid` | Verified by Stripe webhook |
| `failed` | Async payment failed (webhook) |
| `canceled` | Checkout session expired |
| `refunded` | Manual / future use |

## Automated actions

### 1. Customer submits quote
- **Supabase:** insert `quote_requests` (`status: new`, `payment_status: none`)
- **Email:** internal notification + customer acknowledgement (Static Forms)
- **Dashboard:** appears in Quotes list and Recent activity

### 2. Admin generates Stripe payment link
- **Server:** `createQuotePaymentLink()` with exact `unit_amount` (Stripe secret key server-only)
- **Supabase:** save `stripe_payment_url`, `quoted_amount_cents`, `payment_status: pending`, **`status: awaiting_payment`**
- **Email:** none (admin sends separately)
- **Dashboard:** revalidated quote detail + list

### 3. Admin sends payment link email
- **Supabase first:** `status: awaiting_payment`, `payment_status: awaiting_payment`, `payment_link_sent_at`
- **Email:** internal `[QUOTE PAYMENT LINK SENT]` + customer payment link email (no internal notes)
- **On email failure:** quote/payment data **kept**; `last_email_error*` fields set; admin can retry
- **Idempotency:** `email_events.event_key = quote_payment_link:{quoteId}:{paymentLinkId}` — sent once per link; failed attempts can retry

### 4. Customer pays on Stripe
- **Webhook:** `/api/stripe-webhook` verifies signature, routes quote sessions via `isQuoteCheckoutSession()`
- **Supabase:** quote → `paid`, `paid_at`, Stripe IDs; `payments` row upserted by `stripe_checkout_session_id`
- **Never:** marking paid from browser return or opening the link
- **Email (after DB save):** internal `[QUOTE PAYMENT RECEIVED]` + customer confirmation
- **Idempotency:** `quote_payment_success:{checkoutSessionId}`

### 5. Stripe payment failure / expiry
- **Webhook:** `payment_status: failed|canceled`, workflow stays **`awaiting_payment`**
- **Email:** none (customer can use same link if still valid)

## Email failure handling

- Quote and payment records are **always saved before** outbound payment-request emails.
- Webhook payment processing completes **before** confirmation emails; email failure does not roll back payment.
- Failures are stored on the quote: `last_email_error`, `last_email_error_at`, `last_email_error_type`
- `email_events.status` is `sent` or `failed` for audit and retry logic
- **Dashboard:** “Quote email alerts” section lists quotes with failures
- **Quote detail:** Automation panel shows error + retry buttons

## Separation from subscription onboarding

| | Quote payments | Onboarding / subscriptions |
|--|----------------|----------------------------|
| Stripe metadata | `kind: quote_payment`, `quote_request_id` | Tier / onboarding metadata |
| Webhook handler | `applyQuoteCheckoutSessionEvent` | `applyCheckoutSessionEvent` |
| Confirmation emails | `sendQuotePaymentConfirmation` | `sendPaymentConfirmation` |
| Payment type in DB | `quote` | subscription / one_time / etc. |

## Required Supabase migrations (in order)

1. `004_workflow_quotes_statuses.sql`
2. `005_quote_management.sql`
3. `006_quote_stripe_payments.sql`
4. `007_quote_automation.sql`

## Environment variables (server only)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STATIC_FORMS_API_KEY` (+ optional `STATIC_FORMS_CUSTOMER_API_KEY`)

Constants and inline documentation also live in `lib/quotes/automation.ts`.
