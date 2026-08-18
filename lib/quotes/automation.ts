import type { QuotePaymentStatus, QuoteStatus } from "@/lib/quotes/statuses";

/** Workflow status after admin generates a Stripe payment link. */
export const STATUS_AFTER_PAYMENT_LINK = "awaiting_payment" satisfies QuoteStatus;

/** Payment status while checkout is open on Stripe. */
export const PAYMENT_STATUS_LINK_PENDING = "pending" satisfies QuotePaymentStatus;

/** Workflow + payment status after admin sends the payment link email. */
export const STATUS_AFTER_PAYMENT_REQUEST_SENT = "awaiting_payment" satisfies QuoteStatus;
export const PAYMENT_STATUS_AFTER_PAYMENT_REQUEST_SENT =
  "awaiting_payment" satisfies QuotePaymentStatus;

/** Workflow + payment status after Stripe confirms payment (webhook only). */
export const STATUS_AFTER_STRIPE_PAID = "paid" satisfies QuoteStatus;
export const PAYMENT_STATUS_AFTER_STRIPE_PAID = "paid" satisfies QuotePaymentStatus;

export type QuoteEmailErrorType =
  | "payment_link_email"
  | "payment_confirmation_email";

export const QUOTE_EMAIL_ERROR_LABELS: Record<QuoteEmailErrorType, string> = {
  payment_link_email: "Payment link email",
  payment_confirmation_email: "Payment confirmation email",
};

/**
 * Status transitions and automated side effects.
 *
 * Manual (admin dashboard):
 * - new → reviewing → quote_preparing (save form)
 * - any pre-payment status → awaiting_payment when payment link generated
 * - awaiting_payment when payment link emailed to customer
 *
 * Automatic (Stripe webhook — quote sessions only, metadata.kind = quote_payment):
 * - awaiting_payment + pending → paid + paid (checkout.session.completed)
 * - awaiting_payment → awaiting_payment + failed (async_payment_failed)
 * - awaiting_payment → awaiting_payment + canceled (session expired)
 *
 * Automatic (emails — idempotent via email_events.event_key):
 * - payment link sent: internal [QUOTE PAYMENT LINK SENT] + customer quote email
 * - payment confirmed: internal [QUOTE PAYMENT RECEIVED] + customer thank-you
 *
 * Never automated:
 * - Marking paid from browser return / opening payment link
 * - Exposing internal_notes in any customer email
 * - Mixing quote checkout with onboarding/subscription checkout handlers
 */
export const QUOTE_AUTOMATION_DOC = true;
