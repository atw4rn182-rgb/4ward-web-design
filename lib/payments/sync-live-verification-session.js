import {
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase/service-rest";
import {
  isLiveVerificationCheckoutSession,
  LIVE_VERIFICATION_AMOUNT_CENTS,
  LIVE_VERIFICATION_DESCRIPTION,
} from "@/lib/payments/live-verification-stripe";

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function statusFromEvent(type, session) {
  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    if (session.payment_status === "unpaid") return "pending";
    return "paid";
  }
  if (type === "checkout.session.async_payment_failed") return "failed";
  if (type === "checkout.session.expired") return "canceled";
  return null;
}

export async function applyLiveVerificationCheckoutSessionEvent(type, session) {
  if (!isLiveVerificationCheckoutSession(session) || !session?.id) return null;

  const status = statusFromEvent(type, session);
  if (!status) return null;

  const existing = first(
    await supabaseSelect(
      "payments",
      `stripe_checkout_session_id=eq.${session.id}&select=id,status`
    )
  );
  const wasPaid = existing?.status === "paid";

  const patch = {
    customer_id: null,
    amount_cents: Number(session.amount_total || LIVE_VERIFICATION_AMOUNT_CENTS),
    currency: session.currency || "usd",
    status,
    payment_type: "other",
    tier: null,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    description: LIVE_VERIFICATION_DESCRIPTION,
    paid_at: status === "paid" ? new Date().toISOString() : null,
  };

  let payment;
  if (existing?.id) {
    payment = await supabasePatch("payments", `id=eq.${existing.id}`, patch);
  } else {
    payment = await supabaseInsert("payments", patch);
  }

  return {
    payment: payment || existing,
    status,
    sendConfirmation: status === "paid" && !wasPaid,
  };
}
