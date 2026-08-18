import {
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase/service-rest";
import { isQuoteCheckoutSession } from "@/lib/payments/quote-stripe";

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function quoteStatusFromEvent(type, session) {
  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    if (session.payment_status === "unpaid") return { payment: "pending", workflow: null };
    return { payment: "paid", workflow: "paid" };
  }
  if (type === "checkout.session.async_payment_failed") {
    return { payment: "failed", workflow: "awaiting_payment" };
  }
  if (type === "checkout.session.expired") {
    return { payment: "canceled", workflow: "awaiting_payment" };
  }
  return null;
}

async function upsertQuotePayment(quoteId, patch) {
  const existing = first(
    await supabaseSelect(
      "payments",
      `quote_request_id=eq.${quoteId}&select=id&order=created_at.desc&limit=1`
    )
  );
  if (existing && existing.id) {
    return supabasePatch("payments", `id=eq.${existing.id}`, patch);
  }
  return supabaseInsert("payments", {
    quote_request_id: quoteId,
    customer_id: null,
    ...patch,
  });
}

export async function applyQuoteCheckoutSessionEvent(type, session) {
  if (!isQuoteCheckoutSession(session) || !session || !session.id) return null;

  const metadata = session.metadata || {};
  const quoteId = metadata.quote_request_id;
  if (!quoteId) return null;

  const statuses = quoteStatusFromEvent(type, session);
  if (!statuses) return null;

  const quote = first(
    await supabaseSelect(
      "quote_requests",
      `id=eq.${quoteId}&select=id,status,payment_status,paid_at,quoted_amount_cents,email,contact_name,company_name,service,currency`
    )
  );
  if (!quote) return null;

  if (quote.payment_status === "paid" && statuses.payment === "paid") {
    return quote;
  }

  const expectedCents = Number(metadata.quoted_amount_cents || quote.quoted_amount_cents || 0);
  const paidCents = Number(session.amount_total || 0);
  if (statuses.payment === "paid" && expectedCents > 0 && paidCents !== expectedCents) {
    console.error(
      `Quote payment amount mismatch for ${quoteId}: expected ${expectedCents}, got ${paidCents}`
    );
  }

  const quotePatch = {
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_payment_link_id: session.payment_link || null,
    stripe_customer_id: session.customer || null,
    payment_status: statuses.payment,
  };

  if (statuses.payment === "paid") {
    quotePatch.status = "paid";
    quotePatch.paid_at = new Date().toISOString();
    if (paidCents > 0) {
      quotePatch.quoted_amount_cents = paidCents;
    }
  } else if (statuses.workflow) {
    quotePatch.status = statuses.workflow;
  }

  Object.keys(quotePatch).forEach((key) => {
    if (quotePatch[key] === undefined) delete quotePatch[key];
  });

  const updated = await supabasePatch("quote_requests", `id=eq.${quoteId}`, quotePatch);

  const paymentPatch = {
    amount_cents: paidCents,
    currency: session.currency || quote.currency || "usd",
    status: statuses.payment === "paid" ? "paid" : statuses.payment,
    payment_type: "quote",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    description: `${quote.service || "Quote"} · ${quote.company_name || quote.contact_name || quote.email}`,
    paid_at: statuses.payment === "paid" ? new Date().toISOString() : null,
  };

  const existingPayment = first(
    await supabaseSelect(
      "payments",
      `stripe_checkout_session_id=eq.${session.id}&select=id`
    )
  );
  if (existingPayment) {
    await supabasePatch("payments", `id=eq.${existingPayment.id}`, paymentPatch);
  } else {
    await upsertQuotePayment(quoteId, paymentPatch);
  }

  return { ...quote, ...quotePatch, ...(updated || {}) };
}
