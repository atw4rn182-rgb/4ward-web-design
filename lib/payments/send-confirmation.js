import { deliverDualEmails } from "@/lib/email/dual-delivery";
import {
  sendPaymentReceivedCustomerEmail,
  sendPaymentReceivedInternalEmail,
  sendQuotePaymentReceivedCustomerEmail,
  sendQuotePaymentReceivedInternalEmail,
} from "@/lib/email/static-forms";
import { tierLabel } from "@/lib/pricing/tier-labels";
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

  const customerEventKey = `payment_success:${session.id}`;
  const internalEventKey = `payment_success_internal:${session.id}`;

  if (session.invoice) {
    try {
      await stripePost(`/invoices/${session.invoice}/send`);
    } catch (error) {
      console.error("Stripe invoice send failed:", error.message);
    }
  }

  const addOnParts = [];
  if (metadata.performance_reports_requested === "yes") {
    addOnParts.push("Monthly Performance Reports");
  }
  if (metadata.admin_dashboard_requested === "yes") {
    addOnParts.push("Private Admin Dashboard");
  }
  const addOnSummary = addOnParts.length ? addOnParts.join(", ") : "None";

  const emailParams = {
    session,
    companyName,
    contactName,
    email,
    tier,
    amountCents: session.amount_total || 0,
    currency: session.currency || "usd",
    domainPreferred: metadata.domain_preferred || "",
    domainSecondChoice: metadata.domain_second_choice || "",
    domainThirdChoice: metadata.domain_third_choice || "",
    addOnSummary,
    logoProvided: metadata.logo_provided || "no",
  };

  await deliverDualEmails({
    customerEventKey,
    internalEventKey,
    eventType: "payment_received",
    recipientEmail: email,
    metadata: { stripeSessionId: session.id, tier },
    sendInternal: () => sendPaymentReceivedInternalEmail(emailParams),
    sendCustomer: () => sendPaymentReceivedCustomerEmail(emailParams),
  });
}

export async function sendQuotePaymentConfirmation(session, quote) {
  if (!session || !session.id || !quote) return { ok: false, skipped: true };
  if (!/^cs_(live|test)_/.test(session.id)) return { ok: false, skipped: true };

  const email = quote.email || session.customer_details?.email || session.customer_email || "";
  const customerEventKey = `quote_payment_success:${session.id}`;
  const internalEventKey = `quote_payment_success_internal:${session.id}`;
  const quoteId = quote.id;

  const emailParams = {
    quote,
    session,
    amountCents: session.amount_total || quote.quoted_amount_cents || 0,
    currency: session.currency || quote.currency || "usd",
  };

  const result = await deliverDualEmails({
    customerEventKey,
    internalEventKey,
    eventType: "quote_payment_received",
    recipientEmail: email,
    metadata: { stripeSessionId: session.id, quoteRequestId: quoteId },
    quoteRequestId: quoteId,
    sendInternal: () => sendQuotePaymentReceivedInternalEmail(emailParams),
    sendCustomer: () => sendQuotePaymentReceivedCustomerEmail(emailParams),
    onCustomerFailed: (message) =>
      recordQuoteEmailErrorRest(quoteId, "payment_confirmation_email", message),
  });

  if (result.ok) {
    await clearQuoteEmailErrorRest(quoteId);
  }

  return result;
}

export { tierLabel };
