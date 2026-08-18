import {
  shouldSendEmail,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/idempotency";
import { sendQuotePaymentLinkEmails } from "@/lib/email/static-forms";
import { clearQuoteEmailErrorRest, recordQuoteEmailErrorRest } from "@/lib/quotes/email-tracking-rest.js";

export async function deliverQuotePaymentLinkEmails(quote) {
  const eventKey = `quote_payment_link:${quote.id}:${quote.stripe_payment_link_id || "manual"}`;
  const email = quote.email || "";

  if (!(await shouldSendEmail(eventKey))) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  try {
    await sendQuotePaymentLinkEmails({
      contactName: quote.contact_name,
      email: quote.email,
      companyName: quote.company_name,
      service: quote.service,
      amountCents: quote.quoted_amount_cents,
      currency: quote.currency,
      paymentUrl: quote.stripe_payment_url,
    });
    await markEmailSent(
      eventKey,
      "quote_payment_link",
      email,
      {
        quoteRequestId: quote.id,
        stripePaymentLinkId: quote.stripe_payment_link_id || "",
      },
      quote.id
    );
    await clearQuoteEmailErrorRest(quote.id);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    await markEmailFailed(
      eventKey,
      "quote_payment_link",
      email,
      message,
      {
        quoteRequestId: quote.id,
        stripePaymentLinkId: quote.stripe_payment_link_id || "",
      },
      quote.id
    );
    await recordQuoteEmailErrorRest(quote.id, "payment_link_email", message);
    return { ok: false, error: message };
  }
}

export async function deliverQuotePaymentConfirmationEmails(session, quote) {
  const { sendQuotePaymentConfirmation } = await import("@/lib/payments/send-confirmation");
  return sendQuotePaymentConfirmation(session, quote);
}
