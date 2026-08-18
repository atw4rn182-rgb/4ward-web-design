import {
  shouldSendEmail,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/idempotency";
import { sendQuoteRequestEmails } from "@/lib/email/static-forms";
import { recordQuoteEmailErrorRest } from "@/lib/quotes/email-tracking-rest.js";

/**
 * Idempotent quote-request emails — one send per quote_requests.id.
 * Prevents duplicates on API retries; duplicate form submissions are deduped upstream.
 */
export async function deliverQuoteRequestEmails(quote) {
  if (!quote || !quote.id) {
    return { ok: false, error: "Quote record missing." };
  }

  const eventKey = `quote_request:${quote.id}`;
  const email = quote.email || "";

  if (!(await shouldSendEmail(eventKey))) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  try {
    await sendQuoteRequestEmails({
      quoteId: quote.id,
      contactName: quote.contact_name,
      email: quote.email,
      phone: quote.phone,
      companyName: quote.company_name,
      service: quote.service,
      quantity: quote.quantity,
      message: quote.message,
    });
    await markEmailSent(
      eventKey,
      "quote_request",
      email,
      { quoteRequestId: quote.id, service: quote.service || "" },
      quote.id
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    await markEmailFailed(
      eventKey,
      "quote_request",
      email,
      message,
      { quoteRequestId: quote.id },
      quote.id
    );
    await recordQuoteEmailErrorRest(quote.id, "quote_request_email", message);
    return { ok: false, error: message };
  }
}
