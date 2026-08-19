import { deliverDualEmails } from "@/lib/email/dual-delivery";
import {
  sendQuoteRequestCustomerEmail,
  sendQuoteRequestInternalEmail,
} from "@/lib/email/static-forms";
import { recordQuoteEmailErrorRest } from "@/lib/quotes/email-tracking-rest.js";

/**
 * Idempotent quote-request emails — customer send is marked sent only on success.
 */
export async function deliverQuoteRequestEmails(quote) {
  if (!quote || !quote.id) {
    return { ok: false, error: "Quote record missing." };
  }

  const eventKey = `quote_request:${quote.id}`;
  const internalEventKey = `quote_request_internal:${quote.id}`;
  const email = quote.email || "";

  return deliverDualEmails({
    customerEventKey: eventKey,
    internalEventKey,
    eventType: "quote_request",
    recipientEmail: email,
    metadata: { quoteRequestId: quote.id, service: quote.service || "" },
    quoteRequestId: quote.id,
    sendInternal: () =>
      sendQuoteRequestInternalEmail({
        quoteId: quote.id,
        contactName: quote.contact_name,
        email: quote.email,
        phone: quote.phone,
        companyName: quote.company_name,
        service: quote.service,
        quantity: quote.quantity,
        message: quote.message,
      }),
    sendCustomer: () =>
      sendQuoteRequestCustomerEmail({
        quoteId: quote.id,
        contactName: quote.contact_name,
        email: quote.email,
        phone: quote.phone,
        companyName: quote.company_name,
        service: quote.service,
        quantity: quote.quantity,
        message: quote.message,
      }),
    onCustomerFailed: (message) =>
      recordQuoteEmailErrorRest(quote.id, "quote_request_email", message),
  });
}
