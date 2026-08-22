import {
  shouldSendEmail,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/idempotency";
import {
  classifyStaticFormsError,
  normalizeStaticFormsEnvKey,
} from "@/lib/email/static-forms-diagnostics";
import { isLiveVerificationCheckoutSession } from "@/lib/payments/live-verification-stripe";

const STATIC_FORMS_URL = "https://api.staticforms.dev/submit";

async function postInternalVerificationEmail(session) {
  const key = normalizeStaticFormsEnvKey(process.env.STATIC_FORMS_API_KEY);
  if (!key) {
    throw new Error("STATIC_FORMS_API_KEY is not configured");
  }

  const amount = ((session.amount_total || 100) / 100).toFixed(2);
  const form = new FormData();
  form.set("apiKey", key);
  form.set("accessKey", key);
  form.set(
    "subject",
    `[LIVE PAYMENT VERIFICATION] — $${amount} USD — ${session.id}`
  );
  form.set("name", "4Ward Admin Verification");
  form.set("email", "payments@4wardwebdesign.com");
  form.set(
    "message",
    [
      "LIVE PAYMENT VERIFICATION — internal only.",
      "",
      `Amount: $${amount} USD`,
      `Checkout session: ${session.id}`,
      `Payment intent: ${session.payment_intent || "—"}`,
      "",
      "This is not a customer onboarding payment. No client, onboarding, or project record was created.",
      "Confirm Admin → Payments shows paid $1.00 with description LIVE PAYMENT VERIFICATION.",
    ].join("\n")
  );
  form.set("requestType", "live_verification_payment");
  form.set("stripeSessionId", session.id || "");

  const response = await fetch(STATIC_FORMS_URL, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok) {
    const message =
      (result && (result.error || result.message)) ||
      `Static Forms HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function sendLiveVerificationConfirmation(session) {
  if (!session?.id || !isLiveVerificationCheckoutSession(session)) {
    return { ok: false, skipped: true };
  }
  if (!/^cs_live_/.test(session.id)) {
    return { ok: false, skipped: true, reason: "not_live_session" };
  }

  const eventKey = `live_verification_payment:${session.id}`;
  if (!(await shouldSendEmail(eventKey))) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  try {
    await postInternalVerificationEmail(session);
    await markEmailSent(eventKey, "live_verification_payment", null, {
      stripeSessionId: session.id,
      leg: "internal",
    });
    return { ok: true };
  } catch (error) {
    const { safeMessage } = classifyStaticFormsError(error);
    await markEmailFailed(
      eventKey,
      "live_verification_payment",
      null,
      safeMessage,
      { stripeSessionId: session.id, leg: "internal" }
    );
    console.error("Live verification email failed:", safeMessage);
    return { ok: false, error: safeMessage };
  }
}
