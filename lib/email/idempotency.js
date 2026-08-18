import {
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase/service-rest";

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findEmailEvent(eventKey) {
  if (!eventKey) return null;
  return first(
    await supabaseSelect(
      "email_events",
      `event_key=eq.${encodeURIComponent(eventKey)}&select=id,status,error_message&limit=1`
    )
  );
}

/**
 * Returns true if email should be attempted (not already sent successfully).
 * Failed attempts may be retried.
 */
export async function shouldSendEmail(eventKey) {
  if (!eventKey) return true;
  try {
    const existing = await findEmailEvent(eventKey);
    if (!existing) return true;
    return existing.status !== "sent";
  } catch (error) {
    console.error("Email idempotency check failed:", error.message);
    return true;
  }
}

/** @deprecated Use shouldSendEmail + markEmailSent */
export async function claimEmailEvent(eventKey, eventType, recipientEmail, metadata = {}) {
  return shouldSendEmail(eventKey);
}

export async function markEmailSent(
  eventKey,
  eventType,
  recipientEmail,
  metadata = {},
  quoteRequestId = null
) {
  if (!eventKey) return;
  try {
    const existing = await findEmailEvent(eventKey);
    const row = {
      event_key: eventKey,
      event_type: eventType,
      recipient_email: recipientEmail || null,
      metadata,
      status: "sent",
      error_message: null,
      quote_request_id: quoteRequestId || metadata.quoteRequestId || null,
    };
    if (existing && existing.id) {
      await supabasePatch("email_events", `id=eq.${existing.id}`, row);
    } else {
      await supabaseInsert("email_events", row);
    }
  } catch (error) {
    if (/duplicate|unique|23505/i.test(String(error.message || ""))) {
      await supabasePatch(
        "email_events",
        `event_key=eq.${encodeURIComponent(eventKey)}`,
        {
          status: "sent",
          error_message: null,
          event_type: eventType,
          recipient_email: recipientEmail || null,
          metadata,
          quote_request_id: quoteRequestId || metadata.quoteRequestId || null,
        }
      );
      return;
    }
    console.error("Email sent record failed:", error.message);
  }
}

export async function markEmailFailed(
  eventKey,
  eventType,
  recipientEmail,
  errorMessage,
  metadata = {},
  quoteRequestId = null
) {
  if (!eventKey) return;
  const message = String(errorMessage || "Email delivery failed").slice(0, 2000);
  try {
    const existing = await findEmailEvent(eventKey);
    const row = {
      event_key: eventKey,
      event_type: eventType,
      recipient_email: recipientEmail || null,
      metadata,
      status: "failed",
      error_message: message,
      quote_request_id: quoteRequestId || metadata.quoteRequestId || null,
    };
    if (existing && existing.id) {
      await supabasePatch("email_events", `id=eq.${existing.id}`, row);
    } else {
      await supabaseInsert("email_events", row);
    }
  } catch (error) {
    console.error("Email failure record failed:", error.message);
  }
}
