import {
  shouldSendEmail,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/idempotency";
import {
  sendPaymentReceivedEmails,
  sendQuotePaymentReceivedEmails,
  tierLabel,
} from "@/lib/email/static-forms";
import { isQuoteCheckoutSession } from "@/lib/payments/quote-stripe";
import {
  clearQuoteEmailErrorRest,
  recordQuoteEmailErrorRest,
} from "@/lib/quotes/email-tracking-rest.js";

async function stripePost(path) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  const body = new URLSearchParams();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return response.json();
}

export async function sendPaymentConfirmation(session) {
  if (!session || !session.id) return;
  if (!/^cs_(live|test)_/.test(session.id) || /e2e/i.test(session.id)) return;
  if (isQuoteCheckoutSession(session)) return;

  const metadata = session.metadata || {};
  const email =
    (session.customer_details && session.customer_details.email) ||
    session.customer_email ||
    metadata.email ||
    "";
  const companyName = metadata.company_name || "";
  const contactName = metadata.contact_name || "";
  const tier = metadata.tier || "";

  const eventKey = `payment_success:${session.id}`;
  if (!(await shouldSendEmail(eventKey))) return;

  if (session.invoice) {
    try {
      await stripePost(`/invoices/${session.invoice}/send`);
    } catch (error) {
      console.error("Stripe invoice send failed:", error.message);
    }
  }

  try {
    await sendPaymentReceivedEmails({
      session,
      companyName,
      contactName,
      email,
      tier,
      amountCents: session.amount_total || 0,
      currency: session.currency || "usd",
    });
    await markEmailSent(eventKey, "payment_received", email, {
      stripeSessionId: session.id,
      tier,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    console.error("Payment confirmation emails failed:", message);
    await markEmailFailed(eventKey, "payment_received", email, message, {
      stripeSessionId: session.id,
      tier,
    });
  }
}

export async function sendQuotePaymentConfirmation(session, quote) {
  if (!session || !session.id || !quote) return { ok: false, skipped: true };
  if (!/^cs_(live|test)_/.test(session.id)) return { ok: false, skipped: true };

  const email = quote.email || session.customer_details?.email || session.customer_email || "";
  const eventKey = `quote_payment_success:${session.id}`;
  const quoteId = quote.id;

  if (!(await shouldSendEmail(eventKey))) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  try {
    await sendQuotePaymentReceivedEmails({
      quote,
      session,
      amountCents: session.amount_total || quote.quoted_amount_cents || 0,
      currency: session.currency || quote.currency || "usd",
    });
    await markEmailSent(
      eventKey,
      "quote_payment_received",
      email,
      { stripeSessionId: session.id, quoteRequestId: quoteId },
      quoteId
    );
    await clearQuoteEmailErrorRest(quoteId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    console.error("Quote payment confirmation emails failed:", message);
    await markEmailFailed(
      eventKey,
      "quote_payment_received",
      email,
      message,
      { stripeSessionId: session.id, quoteRequestId: quoteId },
      quoteId
    );
    await recordQuoteEmailErrorRest(quoteId, "payment_confirmation_email", message);
    return { ok: false, error: message };
  }
}

export { tierLabel };
