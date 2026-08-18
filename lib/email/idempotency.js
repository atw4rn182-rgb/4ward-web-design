import {
  supabaseInsert,
  supabaseSelect,
} from "@/lib/supabase/service-rest";

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Returns true if this event_key was newly recorded (safe to send email).
 * Returns false if already sent (Stripe webhook retry / duplicate).
 */
export async function claimEmailEvent(eventKey, eventType, recipientEmail, metadata = {}) {
  if (!eventKey) return true;
  try {
    const existing = first(
      await supabaseSelect(
        "email_events",
        `event_key=eq.${encodeURIComponent(eventKey)}&select=id&limit=1`
      )
    );
    if (existing) return false;
    await supabaseInsert("email_events", {
      event_key: eventKey,
      event_type: eventType,
      recipient_email: recipientEmail || null,
      metadata,
    });
    return true;
  } catch (error) {
    if (/duplicate|unique|23505/i.test(String(error.message || ""))) {
      return false;
    }
    console.error("Email idempotency check failed:", error.message);
    return true;
  }
}
