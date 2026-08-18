import { claimEmailEvent } from "@/lib/email/idempotency";
import {
  sendPaymentReceivedEmails,
  sendQuotePaymentReceivedEmails,
  tierLabel,
} from "@/lib/email/static-forms";
import { isQuoteCheckoutSession } from "@/lib/payments/quote-stripe";

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
  const shouldSend = await claimEmailEvent(eventKey, "payment_received", email, {
    stripeSessionId: session.id,
    tier,
  });
  if (!shouldSend) return;

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
  } catch (error) {
    console.error("Payment confirmation emails failed:", error.message);
  }
}

export async function sendQuotePaymentConfirmation(session, quote) {
  if (!session || !session.id || !quote) return;
  if (!/^cs_(live|test)_/.test(session.id)) return;

  const email = quote.email || session.customer_details?.email || session.customer_email || "";
  const eventKey = `quote_payment_success:${session.id}`;
  const shouldSend = await claimEmailEvent(eventKey, "quote_payment_received", email, {
    stripeSessionId: session.id,
    quoteRequestId: quote.id,
  });
  if (!shouldSend) return;

  try {
    await sendQuotePaymentReceivedEmails({
      quote,
      session,
      amountCents: session.amount_total || quote.quoted_amount_cents || 0,
      currency: session.currency || quote.currency || "usd",
    });
  } catch (error) {
    console.error("Quote payment confirmation emails failed:", error.message);
  }
}

export { tierLabel };
