import { NextResponse } from "next/server";

const TIERS = {
  tier1: {
    id: "tier1",
    name: "Tier 1 — Single Page Website",
    amount: 9900,
    mode: "subscription",
  },
  tier2: {
    id: "tier2",
    name: "Tier 2 — Two-Page Customized Site",
    amount: 22500,
    mode: "subscription",
  },
  tier3: {
    id: "tier3",
    name: "Tier 3 — Multi-Page Multi-Department Website",
    amount: 39900,
    mode: "subscription",
  },
  "buyout-tier1": {
    id: "buyout-tier1",
    name: "Tier 4 Buy-Out — 2 years of Tier 1",
    amount: 9900 * 24,
    mode: "payment",
    baseTier: "tier1",
  },
  "buyout-tier2": {
    id: "buyout-tier2",
    name: "Tier 4 Buy-Out — 2 years of Tier 2",
    amount: 22500 * 24,
    mode: "payment",
    baseTier: "tier2",
  },
  "buyout-tier3": {
    id: "buyout-tier3",
    name: "Tier 4 Buy-Out — 2 years of Tier 3",
    amount: 39900 * 24,
    mode: "payment",
    baseTier: "tier3",
  },
};

const LAUNCH_FEE_CENTS = 20000;
const LAUNCH_FEE_DESCRIPTION =
  "One-time kickoff: consultation, custom design/setup, domain/DNS if needed, basic on-page SEO, Google Analytics, contact forms, mobile optimization, testing, and onboarding.";

const PRICE_ENV = {
  tier1: "STRIPE_PRICE_TIER1",
  tier2: "STRIPE_PRICE_TIER2",
  tier3: "STRIPE_PRICE_TIER3",
};

const ALLOWED_ADDONS = new Set(["bilingual", "reports"]);
const REPORTS_CENTS = 4900;

function bilingualCents(tierId) {
  if (tierId === "tier1" || tierId === "tier2") return 500;
  if (tierId === "tier3") return 0;
  return null;
}

function normalizeAddOns(raw, tier) {
  if (!tier || tier.mode !== "subscription") return [];
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach((value) => {
    const id = sanitize(String(value), 40);
    if (ALLOWED_ADDONS.has(id) && !out.includes(id)) out.push(id);
  });
  return out;
}

function recurringAddonLineItem(index, { id, name, amount }) {
  return {
    [`line_items[${index}][quantity]`]: 1,
    [`line_items[${index}][price_data][currency]`]: "usd",
    [`line_items[${index}][price_data][unit_amount]`]: amount,
    [`line_items[${index}][price_data][recurring][interval]`]: "month",
    [`line_items[${index}][price_data][product_data][name]`]: name,
    [`line_items[${index}][price_data][product_data][metadata][kind]`]: "addon",
    [`line_items[${index}][price_data][product_data][metadata][addon]`]: id,
  };
}

function formatUsPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function confirmationMethodFromBody(value) {
  const method = sanitize(String(value || ""), 20).toLowerCase();
  if (method === "email" || method === "sms") return method;
  return "";
}

function sanitize(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function encodeForm(params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.append(key, String(value));
  });
  return body;
}

async function stripeRequest(secret, path, params) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(params),
  });
  const data = await response.json();
  if (!response.ok) {
    const message =
      data && data.error && data.error.message
        ? data.error.message
        : "Stripe request failed";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function launchFeeLineItem(index) {
  return {
    [`line_items[${index}][quantity]`]: 1,
    [`line_items[${index}][price_data][currency]`]: "usd",
    [`line_items[${index}][price_data][unit_amount]`]: LAUNCH_FEE_CENTS,
    [`line_items[${index}][price_data][product_data][name]`]:
      "Launch Fee (one-time $200)",
    [`line_items[${index}][price_data][product_data][description]`]:
      LAUNCH_FEE_DESCRIPTION,
    [`line_items[${index}][price_data][product_data][metadata][kind]`]:
      "launch_fee",
  };
}

function buildLineItemParams(tier, addOnIds) {
  const priceEnvKey = PRICE_ENV[tier.id];
  const priceId = priceEnvKey ? process.env[priceEnvKey] : null;
  let items;

  if (tier.mode === "subscription" && priceId) {
    items = {
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
    };
  } else if (tier.mode === "subscription") {
    items = {
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": tier.amount,
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]":
        `${tier.name} — first month`,
      "line_items[0][price_data][product_data][description]":
        `Due today with the $200 Launch Fee. Then $${Math.round(tier.amount / 100)}/month until canceled.`,
      "line_items[0][price_data][product_data][metadata][tier]": tier.id,
    };
  } else {
    items = {
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": tier.amount,
      "line_items[0][price_data][product_data][name]": tier.name,
      "line_items[0][price_data][product_data][metadata][tier]": tier.id,
      "line_items[0][price_data][product_data][metadata][baseTier]":
        tier.baseTier || "",
    };
  }

  const extra = {};
  let index = 1;
  if (tier.mode === "subscription") {
    if (addOnIds.includes("bilingual")) {
      const amount = bilingualCents(tier.id);
      if (amount > 0) {
        Object.assign(
          extra,
          recurringAddonLineItem(index, {
            id: "bilingual",
            name: "Bilingual Website",
            amount,
          })
        );
        index += 1;
      }
    }
    if (addOnIds.includes("reports")) {
      Object.assign(
        extra,
        recurringAddonLineItem(index, {
          id: "reports",
          name: "Monthly reports",
          amount: REPORTS_CENTS,
        })
      );
      index += 1;
    }
  }

  return {
    ...items,
    ...extra,
    ...launchFeeLineItem(index),
  };
}

function metadataParams(prefix, metadata) {
  const out = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    out[`${prefix}[${key}]`] = String(value).slice(0, 500);
  });
  return out;
}

function siteOrigin(request) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  return `${proto}://${host}`;
}

function json(status, body) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  if (!secret) {
    return json(503, {
      error:
        "Stripe is not configured yet. Add STRIPE_SECRET_KEY in your hosting environment.",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const tierKey = sanitize(body.tier, 40);
  const tier = TIERS[tierKey];
  if (!tier) {
    return json(400, { error: "Invalid plan selection" });
  }

  const companyName = sanitize(body.companyName, 120);
  const contactName = sanitize(body.contactName, 120);
  const email = sanitize(body.email, 160).toLowerCase();
  const phone = formatUsPhone(body.phone);
  const confirmationMethod = confirmationMethodFromBody(body.confirmationMethod);
  const address = sanitize(body.address, 240);
  const existingLinks = sanitize(body.existingLinks, 1000);
  const signerName = sanitize(body.signerName, 120);
  const agreementVersion =
    sanitize(body.agreementVersion, 80) || "service-agreement-v1";
  const companyInformation = sanitize(body.companyInformation, 2000);
  const logoName = sanitize(body.logoName, 160);
  const signedAgreement = sanitize(body.signedAgreement, 20);
  const addOnIds = normalizeAddOns(body.addOns, tier);

  if (!companyName || !contactName || !email || !signerName || !phone || !confirmationMethod) {
    return json(400, { error: "Missing required onboarding fields" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Invalid email address" });
  }

  const origin = siteOrigin(request);
  const metadata = {
    tier: tier.id,
    company_name: companyName,
    contact_name: contactName,
    phone,
    confirmation_method: confirmationMethod,
    address,
    existing_links: existingLinks.slice(0, 450),
    signer_name: signerName,
    agreement_version: agreementVersion,
    agreement_signed_at: new Date().toISOString(),
    signed_agreement: signedAgreement || "yes",
    company_information: companyInformation.slice(0, 450),
    logo_name: logoName,
    logo_provided: logoName ? "yes" : "no",
    form_handler: "staticforms",
    launch_fee_cents: String(LAUNCH_FEE_CENTS),
    addons: addOnIds.join(",") || "none",
    bilingual_requested: addOnIds.includes("bilingual") ? "yes" : "no",
    reports_requested: addOnIds.includes("reports") ? "yes" : "no",
  };

  try {
    const customer = await stripeRequest(secret, "/customers", {
      email,
      name: companyName,
      phone: phone || undefined,
      ...metadataParams("metadata", metadata),
    });

    const sessionParams = {
      mode: tier.mode,
      customer: customer.id,
      client_reference_id: `${tier.id}:${companyName}`.slice(0, 200),
      success_url: `${origin}/onboarding.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/onboarding.html?canceled=1&tier=${encodeURIComponent(tierKey)}`,
      billing_address_collection: "required",
      allow_promotion_codes: "true",
      "custom_text[submit][message]":
        tier.mode === "subscription"
          ? "Today you pay the $200 Launch Fee plus the first month of your plan."
          : "Today you pay the $200 Launch Fee plus two years of your chosen tier.",
      ...buildLineItemParams(tier, addOnIds),
      ...metadataParams("metadata", metadata),
    };

    if (tier.mode === "subscription") {
      Object.assign(
        sessionParams,
        metadataParams("subscription_data[metadata]", metadata)
      );
    } else {
      Object.assign(
        sessionParams,
        metadataParams("payment_intent_data[metadata]", metadata)
      );
    }

    const session = await stripeRequest(
      secret,
      "/checkout/sessions",
      sessionParams
    );
    return json(200, {
      url: session.url,
      sessionId: session.id,
      publishableKey,
      liveMode: String(secret).startsWith("sk_live_"),
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return json(error.status || 500, {
      error: error.message || "Unable to start Stripe Checkout",
    });
  }
}
