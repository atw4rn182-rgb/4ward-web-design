import {
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase/service-rest";

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function paymentTypeFromSession(session) {
  if (session.mode === "subscription") return "subscription";
  const tier = session.metadata && session.metadata.tier;
  if (tier && String(tier).startsWith("buyout-")) return "buyout";
  return "one_time";
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

export async function recordPendingCheckoutPayment({
  session,
  customerId,
  tierId,
  description,
}) {
  if (!session || !session.id) return null;
  const existing = first(
    await supabaseSelect(
      "payments",
      `stripe_checkout_session_id=eq.${session.id}&select=id,status`
    )
  );
  const row = {
    customer_id: customerId || null,
    amount_cents: Number(session.amount_total || 0),
    currency: session.currency || "usd",
    status: "pending",
    payment_type: paymentTypeFromSession(session),
    tier: tierId || (session.metadata && session.metadata.tier) || null,
    stripe_checkout_session_id: session.id,
    stripe_customer_id: session.customer || null,
    description: description || "Checkout session",
  };
  if (existing) return existing;
  return supabaseInsert("payments", row);
}

export async function applyCheckoutSessionEvent(type, session) {
  const status = statusFromEvent(type, session);
  if (!status || !session || !session.id) return null;

  const metadata = session.metadata || {};
  let payment = first(
    await supabaseSelect(
      "payments",
      `stripe_checkout_session_id=eq.${session.id}&select=id,customer_id,status`
    )
  );

  const patch = {
    amount_cents: Number(session.amount_total || 0),
    currency: session.currency || "usd",
    status,
    payment_type: paymentTypeFromSession(session),
    tier: metadata.tier || null,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    description: metadata.company_name
      ? `${metadata.company_name} · ${metadata.tier || "checkout"}`
      : "Checkout session",
  };
  if (status === "paid") {
    patch.paid_at = new Date().toISOString();
  }

  if (payment) {
    payment = await supabasePatch("payments", `id=eq.${payment.id}`, patch);
  } else {
    payment = await supabaseInsert("payments", {
      customer_id: metadata.supabase_customer_id || null,
      ...patch,
    });
  }

  const customerId = (payment && payment.customer_id) || metadata.supabase_customer_id;
  if (customerId && (status === "paid" || status === "canceled" || status === "failed")) {
    if (status === "paid") {
      await supabasePatch("customers", `id=eq.${customerId}`, { status: "active" });
    } else if (status === "canceled" || status === "failed") {
      await supabasePatch("customers", `id=eq.${customerId}`, {
        status: "payment_pending",
      });
    }
  }

  if (customerId && metadata.supabase_onboarding_id) {
    const onboardingStatus =
      status === "paid"
        ? "in_progress"
        : status === "canceled" || status === "failed"
          ? "payment_pending"
          : null;
    if (onboardingStatus) {
      try {
        await supabasePatch(
          "onboarding_submissions",
          `id=eq.${metadata.supabase_onboarding_id}`,
          { status: onboardingStatus }
        );
      } catch {
        // Onboarding status update is best-effort.
      }
    }
  } else if (customerId && status === "paid") {
    try {
      const pending = await supabaseSelect(
        "onboarding_submissions",
        `customer_id=eq.${customerId}&status=eq.payment_pending&select=id&order=created_at.desc&limit=1`
      );
      const row = pending[0];
      if (row && row.id) {
        await supabasePatch("onboarding_submissions", `id=eq.${row.id}`, {
          status: "in_progress",
        });
      }
    } catch {
      // Best-effort onboarding status sync.
    }
  }

  if (status === "paid" && customerId) {
    const projects = await supabaseSelect(
      "website_projects",
      `customer_id=eq.${customerId}&select=id`
    );
    if (!projects.length) {
      await supabaseInsert("website_projects", {
        customer_id: customerId,
        name: `${metadata.company_name || "New client"} website`,
        tier: metadata.tier || null,
        status: "intake",
      });
    }
    try {
      await supabaseInsert("notes", {
        customer_id: customerId,
        body: `Payment received for ${metadata.tier || "checkout"}.`,
        website: metadata.company_name || null,
      });
    } catch {
      try {
        await supabaseInsert("notes", {
          customer_id: customerId,
          website: `Payment received for ${metadata.tier || "checkout"}.`,
        });
      } catch {
        // Notes are optional; payment and client status already updated.
      }
    }
  }

  return payment;
}

export async function applyInvoiceEvent(type, invoice) {
  if (!invoice || !invoice.id) return null;
  if (invoice.billing_reason === "subscription_create") return null;

  const status = type === "invoice.paid" ? "paid" : type === "invoice.payment_failed" ? "failed" : null;
  if (!status) return null;

  const intentId = invoice.payment_intent || null;
  if (intentId) {
    const existing = first(
      await supabaseSelect(
        "payments",
        `stripe_payment_intent_id=eq.${intentId}&select=id`
      )
    );
    if (existing) {
      return supabasePatch("payments", `id=eq.${existing.id}`, {
        status,
        amount_cents: Number(invoice.amount_paid || invoice.amount_due || 0),
        paid_at: status === "paid" ? new Date().toISOString() : null,
      });
    }
  }

  let customerId = null;
  const stripeCustomerId = invoice.customer;
  if (stripeCustomerId) {
    const match = first(
      await supabaseSelect(
        "payments",
        `stripe_customer_id=eq.${stripeCustomerId}&select=customer_id&limit=1`
      )
    );
    customerId = match && match.customer_id;
  }

  return supabaseInsert("payments", {
    customer_id: customerId,
    amount_cents: Number(invoice.amount_paid || invoice.amount_due || 0),
    currency: invoice.currency || "usd",
    status,
    payment_type: "subscription",
    stripe_payment_intent_id: intentId,
    stripe_customer_id: stripeCustomerId || null,
    description: invoice.billing_reason || "Invoice",
    paid_at: status === "paid" ? new Date().toISOString() : null,
  });
}
