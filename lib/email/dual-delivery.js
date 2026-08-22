import {
  shouldSendEmail,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/idempotency";
import { classifyStaticFormsError } from "@/lib/email/static-forms-diagnostics";

/**
 * Send internal + customer emails with separate idempotency keys.
 * The customer event key is authoritative for "delivery complete" — only marked
 * sent when the customer-facing email succeeds.
 */
export async function deliverDualEmails({
  customerEventKey,
  internalEventKey,
  eventType,
  recipientEmail,
  metadata = {},
  quoteRequestId = null,
  sendInternal,
  sendCustomer,
  onCustomerFailed,
}) {
  if (!(await shouldSendEmail(customerEventKey))) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  if (internalEventKey && (await shouldSendEmail(internalEventKey))) {
    try {
      await sendInternal();
      await markEmailSent(
        internalEventKey,
        `${eventType}_internal`,
        recipientEmail,
        { ...metadata, leg: "internal" },
        quoteRequestId
      );
    } catch (error) {
      const { safeMessage } = classifyStaticFormsError(error);
      console.error(`${eventType} internal email failed:`, safeMessage);
      await markEmailFailed(
        internalEventKey,
        `${eventType}_internal`,
        recipientEmail,
        safeMessage,
        { ...metadata, leg: "internal" },
        quoteRequestId
      );
    }
  }

  const customerResult = await sendCustomer();

  if (customerResult.skipped) {
    const reason = customerResult.reason || "invalid_customer_email";
    await markEmailFailed(
      customerEventKey,
      eventType,
      recipientEmail,
      reason,
      metadata,
      quoteRequestId
    );
    if (onCustomerFailed) {
      await onCustomerFailed(reason);
    }
    return { ok: false, error: reason, customerSkipped: true };
  }

  if (!customerResult.ok) {
    const message = customerResult.error || "Customer email failed";
    await markEmailFailed(
      customerEventKey,
      eventType,
      recipientEmail,
      message,
      metadata,
      quoteRequestId
    );
    if (onCustomerFailed) {
      await onCustomerFailed(message);
    }
    return { ok: false, error: message };
  }

  await markEmailSent(
    customerEventKey,
    eventType,
    recipientEmail,
    metadata,
    quoteRequestId
  );
  return { ok: true };
}
