import { deliverDualEmails } from "@/lib/email/dual-delivery";
import {
  sendQuotePaymentLinkCustomerEmail,
  sendQuotePaymentLinkInternalEmail,
} from "@/lib/email/static-forms";
import { clearQuoteEmailErrorRest, recordQuoteEmailErrorRest } from "@/lib/quotes/email-tracking-rest.js";

export async function deliverQuotePaymentLinkEmails(quote) {
  const linkId = quote.stripe_payment_link_id || "manual";
  const customerEventKey = `quote_payment_link:${quote.id}:${linkId}`;
  const internalEventKey = `quote_payment_link_internal:${quote.id}:${linkId}`;
  const email = quote.email || "";

  const result = await deliverDualEmails({
    customerEventKey,
    internalEventKey,
    eventType: "quote_payment_link",
    recipientEmail: email,
    metadata: {
      quoteRequestId: quote.id,
      stripePaymentLinkId: linkId,
    },
    quoteRequestId: quote.id,
    sendInternal: () =>
      sendQuotePaymentLinkInternalEmail({
        quoteId: quote.id,
        contactName: quote.contact_name,
        email: quote.email,
        companyName: quote.company_name,
        service: quote.service,
        quantity: quote.quantity,
        amountCents: quote.quoted_amount_cents,
        currency: quote.currency,
        paymentUrl: quote.stripe_payment_url,
      }),
    sendCustomer: () =>
      sendQuotePaymentLinkCustomerEmail({
        quoteId: quote.id,
        contactName: quote.contact_name,
        email: quote.email,
        service: quote.service,
        quantity: quote.quantity,
        amountCents: quote.quoted_amount_cents,
        currency: quote.currency,
        paymentUrl: quote.stripe_payment_url,
      }),
    onCustomerFailed: (message) =>
      recordQuoteEmailErrorRest(quote.id, "payment_link_email", message),
  });

  if (result.ok) {
    await clearQuoteEmailErrorRest(quote.id);
  }

  return result;
}

export async function deliverQuotePaymentConfirmationEmails(session, quote) {
  const { sendQuotePaymentConfirmation } = await import("@/lib/payments/send-confirmation");
  return sendQuotePaymentConfirmation(session, quote);
}
