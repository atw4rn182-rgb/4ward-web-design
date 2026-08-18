# Customer email sequence

All customer emails are sent through **Static Forms** (server-side only). Stripe secret keys and webhook secrets never appear in frontend code.

Email sends use **idempotency keys** in `email_events` so Stripe webhook retries do not duplicate messages.

---

## Website onboarding (fixed-tier plans)

| # | When | Recipient | Subject (approx.) | Trigger | Idempotency key |
|---|------|-----------|-------------------|---------|-----------------|
| 1 | Client submits onboarding and is redirected to Stripe Checkout | Customer + internal | `[ONBOARDING — PAYMENT PENDING]` / “Onboarding received — complete payment…” | `POST /api/create-checkout-session` after Supabase save | None (one send per checkout attempt) |
| 2 | Stripe **confirms** payment (webhook) | Customer + internal | `[PAYMENT RECEIVED]` / comprehensive **Welcome — your project is underway** | `POST /api/stripe-webhook` → `sendPaymentConfirmation()` | `payment_success:{checkoutSessionId}` |

### Email 1 — Pre-payment onboarding confirmation
- **Customer:** Acknowledges onboarding received; explains they must complete Stripe Checkout; no charge until payment succeeds; paid welcome email comes later.
- **Internal:** Company, contact, tier, add-ons, logo, **domain preferences**, company info; status payment pending.
- **Not sent** if checkout session creation fails after save (502 returned).

### Email 2 — Paid welcome (post-payment)
- **Customer only after verified webhook** — not on browser return from Stripe.
- Comprehensive guide covering:
  - Payment confirmation
  - What happens next
  - Project milestones (intake → launch → ongoing)
  - Materials still needed (logo, business info, photos/content, domains)
  - Revisions & review stages
  - Communication expectations
  - Before launch / at launch
  - Ongoing support and tier-appropriate updates
- **Internal:** Payment confirmed + domain preferences + note that welcome email was sent.
- **Preserved separately** from quote emails (different handlers and metadata).

---

## Custom quote requests (one-time work)

| # | When | Recipient | Trigger |
|---|------|-----------|---------|
| A | Customer submits quote form | Customer + internal | `POST /api/quote-request` |
| B | Admin sends Stripe payment link | Customer + internal | Admin dashboard → send payment link |
| C | Stripe confirms quote payment | Customer + internal | Webhook → `sendQuotePaymentConfirmation()` |

See [quote-automation.md](./quote-automation.md) for quote status automation.

Quote emails are **never** mixed with onboarding welcome content.

---

## What does *not* send email

- Opening or returning from Stripe Checkout without webhook confirmation
- Generating a quote payment link without clicking “Email link”
- Failed Static Forms delivery (recorded on quote for retry; onboarding pre-payment returns 502)

---

## Required environment variables

- `STATIC_FORMS_API_KEY` — internal notifications
- `STATIC_FORMS_CUSTOMER_API_KEY` — optional separate key for customer auto-replies
- `STRIPE_WEBHOOK_SECRET` — required before paid welcome (email 2) sends

---

## Supabase migrations related to onboarding emails & domains

1. `004_workflow_quotes_statuses.sql` — `email_events` idempotency
2. `008_onboarding_domains.sql` — domain columns on `onboarding_submissions`

Welcome email content is defined in `lib/email/onboarding-welcome.js`.
