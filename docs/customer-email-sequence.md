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

| # | When | Recipient | Subject line | Trigger | Idempotency key |
|---|------|-----------|--------------|---------|-----------------|
| A | Customer submits quote form | Internal + customer | `[QUOTE — NEW REQUEST]` / `[Quote Request] Received — …` | `POST /api/quote-request` | `quote_request:{quoteId}` |
| B | Admin emails Stripe payment link | Internal + customer | `[QUOTE — PAYMENT LINK SENT]` / `[Custom Quote] Payment link — …` | Admin → send payment link | `quote_payment_link:{quoteId}:{paymentLinkId}` |
| C | Stripe confirms quote payment | Internal + customer | `[QUOTE — PAYMENT RECEIVED]` / `[Custom Quote] Payment confirmed — …` | Webhook → `sendQuotePaymentConfirmation()` | `quote_payment_success:{checkoutSessionId}` |

### Email A — Quote request confirmation
- **Customer:** Confirms request received with dynamic summary (name, service, quantity, project details, quote reference). Explains pricing will be reviewed — **not approved yet**. **No charge** implied.
- **Internal:** Full request details + quote ID for Admin → Quotes.
- Duplicate API submissions (same email/service/message within 5 minutes) skip insert and email.

### Email B — Custom payment link
- **Customer:** States what the payment is for, quoted amount from Supabase, secure Stripe link. No internal notes or vendor costs.
- **Internal:** Quote ID, amount, payment URL. Quote status → Awaiting Payment before send.
- Idempotent per payment link ID; admin can retry after failure.

### Email C — Quote payment confirmed
- **Customer:** Payment confirmation with service, quantity, amount paid, quote reference; next steps for custom work.
- **Internal:** Full payment details + Supabase quote ID.
- **Webhook-only** — never sent on page refresh or opening payment link.

Quote templates live in `lib/email/quote-emails.js`. Onboarding uses separate subjects (`[ONBOARDING — …]`, `[PAYMENT RECEIVED]` without `[Custom Quote]`).

See [quote-automation.md](./quote-automation.md) for quote status automation.

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
