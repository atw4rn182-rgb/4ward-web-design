import {
  isSupabaseUniqueViolation,
  supabaseDelete,
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase/service-rest";

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findOnboardingByRef(ref) {
  return first(
    await supabaseSelect(
      "onboarding_submissions",
      `payload->>onboarding_ref=eq.${encodeURIComponent(ref)}&select=id,customer_id&order=created_at.asc,id.asc&limit=1`
    )
  );
}

/**
 * Rebuilds the onboarding (and, if needed, customer) rows for a paid session
 * whose pre-checkout Supabase save did not complete, using the reconciliation
 * metadata stored on the Checkout Session. Keyed by metadata.onboarding_ref so
 * Stripe retries and replays converge on the same rows.
 */
async function reconcileOnboardingFromSession(session, knownCustomerId) {
  const metadata = session.metadata || {};
  const ref = metadata.onboarding_ref;
  if (!ref) return null;

  let onboarding = await findOnboardingByRef(ref);
  if (!onboarding) {
    const addOnIds =
      metadata.addons && metadata.addons !== "none" ? String(metadata.addons).split(",") : [];
    try {
      onboarding = await supabaseInsert("onboarding_submissions", {
        customer_id: knownCustomerId || null,
        tier: metadata.tier || "unknown",
        company_name: metadata.company_name || null,
        contact_name: metadata.contact_name || null,
        email: metadata.email || null,
        phone: metadata.phone || null,
        notes: metadata.company_information || null,
        agreement_accepted: metadata.signed_agreement === "yes",
        domain_preferred: metadata.domain_preferred || null,
        domain_second_choice: metadata.domain_second_choice || null,
        domain_third_choice: metadata.domain_third_choice || null,
        status: "payment_pending",
        payload: {
          onboarding_ref: ref,
          reconciled_from_stripe: true,
          stripe_checkout_session_id: session.id,
          addons: addOnIds,
          performance_reports_requested: metadata.performance_reports_requested === "yes",
          admin_dashboard_requested: metadata.admin_dashboard_requested === "yes",
          existing_links: metadata.existing_links || "",
          logo_name: metadata.logo_name || "",
          agreement_version: metadata.agreement_version || null,
          agreement_signed_at: metadata.agreement_signed_at || null,
        },
      });
    } catch (error) {
      if (!isSupabaseUniqueViolation(error)) throw error;
      onboarding = await findOnboardingByRef(ref);
      if (!onboarding) throw error;
    }
    // Without the 009 unique index, simultaneous deliveries can each insert a
    // row; every delivery converges on the oldest and later inserts remove themselves.
    const earliest = await findOnboardingByRef(ref);
    if (earliest && earliest.id !== onboarding.id) {
      await supabaseDelete("onboarding_submissions", `id=eq.${onboarding.id}`);
      onboarding = earliest;
    }
  }

  if (onboarding.customer_id) {
    return { customerId: onboarding.customer_id, onboardingId: onboarding.id };
  }

  const customer = await supabaseInsert("customers", {
    company_name: metadata.company_name || "New client",
    contact_name: metadata.contact_name || null,
    email: metadata.email || null,
    phone: metadata.phone || null,
    status: "payment_pending",
  });
  const claimed = await supabasePatch(
    "onboarding_submissions",
    `id=eq.${onboarding.id}&customer_id=is.null`,
    { customer_id: customer.id }
  );
  if (!claimed) {
    // A concurrent delivery linked a customer first; drop ours and use theirs.
    await supabaseDelete("customers", `id=eq.${customer.id}`);
    const current = await findOnboardingByRef(ref);
    if (!current || !current.customer_id) {
      throw new Error("Onboarding reconciliation lost a concurrent update; retrying");
    }
    return { customerId: current.customer_id, onboardingId: current.id };
  }
  return { customerId: customer.id, onboardingId: onboarding.id };
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

export async function recordPendingCheckoutPayment(
  { session, customerId, tierId, description },
  options = {}
) {
  if (!session || !session.id) return null;
  const existing = first(
    await supabaseSelect(
      "payments",
      `stripe_checkout_session_id=eq.${session.id}&select=id,status`,
      options
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
  return supabaseInsert("payments", row, options);
}

export async function applyCheckoutSessionEvent(type, session) {
  const status = statusFromEvent(type, session);
  if (!status || !session || !session.id) return null;

  const metadata = session.metadata || {};
  const findPayment = async () =>
    first(
      await supabaseSelect(
        "payments",
        `stripe_checkout_session_id=eq.${session.id}&select=id,customer_id,status`
      )
    );
  let payment = await findPayment();
  const wasPaid = Boolean(payment && payment.status === "paid");

  const reconciled =
    status === "paid" && metadata.onboarding_ref && !metadata.supabase_onboarding_id
      ? await reconcileOnboardingFromSession(
          session,
          (payment && payment.customer_id) || metadata.supabase_customer_id
        )
      : null;
  const onboardingId =
    metadata.supabase_onboarding_id || (reconciled && reconciled.onboardingId) || null;

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
  if (status === "paid" && !wasPaid) {
    patch.paid_at = new Date().toISOString();
  }
  if (payment && !payment.customer_id && reconciled) {
    patch.customer_id = reconciled.customerId;
  }

  if (!payment) {
    try {
      payment = await supabaseInsert("payments", {
        customer_id:
          metadata.supabase_customer_id || (reconciled && reconciled.customerId) || null,
        ...patch,
      });
    } catch (error) {
      if (!isSupabaseUniqueViolation(error)) throw error;
      payment = await findPayment();
      if (!payment) throw error;
      delete patch.paid_at;
      payment = await supabasePatch("payments", `id=eq.${payment.id}`, patch);
    }
  } else {
    payment = await supabasePatch("payments", `id=eq.${payment.id}`, patch);
  }

  const customerId =
    (payment && payment.customer_id) ||
    metadata.supabase_customer_id ||
    (reconciled && reconciled.customerId);
  if (customerId && (status === "paid" || status === "canceled" || status === "failed")) {
    if (status === "paid") {
      await supabasePatch("customers", `id=eq.${customerId}`, { status: "active" });
    } else if (status === "canceled" || status === "failed") {
      await supabasePatch("customers", `id=eq.${customerId}`, {
        status: "payment_pending",
      });
    }
  }

  if (customerId && onboardingId) {
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
          `id=eq.${onboardingId}`,
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
      const name = `${metadata.company_name || "New client"} website`;
      const project = await supabaseInsert("website_projects", {
        customer_id: customerId,
        name,
        tier: metadata.tier || null,
        status: "intake",
      });
      // Simultaneous deliveries of one event can both pass the empty check above;
      // the later insert removes itself so exactly one project remains.
      const duplicates = await supabaseSelect(
        "website_projects",
        `customer_id=eq.${customerId}&name=eq.${encodeURIComponent(name)}&select=id&order=created_at.asc,id.asc`
      );
      if (project && duplicates.length > 1 && duplicates[0].id !== project.id) {
        await supabaseDelete("website_projects", `id=eq.${project.id}`);
      }
    }
  }

  if (status === "paid" && customerId && !wasPaid) {
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

function invoicePaymentIntentId(invoice) {
  const idOf = (value) => (typeof value === "string" ? value : (value && value.id) || null);
  if (invoice.payment_intent) return idOf(invoice.payment_intent);
  const entries = (invoice.payments && invoice.payments.data) || [];
  const entry = entries.find((item) => item && item.payment && item.payment.payment_intent);
  return entry ? idOf(entry.payment.payment_intent) : null;
}

export async function applyInvoiceEvent(type, invoice) {
  if (!invoice || !invoice.id) return null;
  if (invoice.billing_reason === "subscription_create") return null;

  const status = type === "invoice.paid" ? "paid" : type === "invoice.payment_failed" ? "failed" : null;
  if (!status) return null;

  // Newer Stripe API versions omit invoice.payment_intent; the invoice ID then
  // stands in so retried deliveries update one row instead of inserting more.
  const intentId = invoicePaymentIntentId(invoice) || invoice.id;
  const existing = first(
    await supabaseSelect(
      "payments",
      `stripe_payment_intent_id=eq.${intentId}&select=id,status`
    )
  );
  if (existing) {
    const update = {
      status,
      amount_cents: Number(invoice.amount_paid || invoice.amount_due || 0),
    };
    if (status !== "paid") update.paid_at = null;
    else if (existing.status !== "paid") update.paid_at = new Date().toISOString();
    return supabasePatch("payments", `id=eq.${existing.id}`, update);
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
