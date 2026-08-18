import { NextResponse } from "next/server";
import { supabaseInsert } from "@/lib/supabase/service-rest";
import { recordPendingCheckoutPayment } from "@/lib/payments/sync-stripe-session";
import { getStripeEnv } from "@/lib/stripe/env";
import {
  attachLogoToStaticForms,
  sendOnboardingPendingEmails,
} from "@/lib/email/static-forms";
import {
  isValidDomain,
  normalizeDomainInput,
} from "@/lib/onboarding/domains";
import {
  addOnPayloadFlags,
  addOnSummary,
  addonById,
  normalizeAddOnIds,
} from "@/lib/pricing/add-ons";

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

function normalizeAddOns(raw, tier) {
  return normalizeAddOnIds(raw, tier && tier.mode);
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
    addOnIds.forEach((addonId) => {
      const addon = addonById(addonId);
      if (!addon) return;
      Object.assign(
        extra,
        recurringAddonLineItem(index, {
          id: addon.id,
          name: addon.stripeName,
          amount: addon.cents,
        })
      );
      index += 1;
    });
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

async function saveOnboardingRecord(record) {
  try {
    const customer = await supabaseInsert("customers", {
      company_name: record.companyName,
      contact_name: record.contactName,
      email: record.email,
      phone: record.phone,
      status: "payment_pending",
    });
    const onboarding = await supabaseInsert("onboarding_submissions", {
      customer_id: customer && customer.id ? customer.id : null,
      tier: record.tier,
      company_name: record.companyName,
      contact_name: record.contactName,
      email: record.email,
      phone: record.phone,
      notes: record.companyInformation || null,
      agreement_accepted: record.signedAgreement === "yes",
      domain_preferred: record.domainPreferred,
      domain_second_choice: record.domainSecondChoice || null,
      domain_third_choice: record.domainThirdChoice || null,
      status: "payment_pending",
      payload: {
        ...addOnPayloadFlags(record.addOnIds),
        existing_links: record.existingLinks,
        logo_name: record.logoName,
        domain_preferred: record.domainPreferred,
        domain_second_choice: record.domainSecondChoice || null,
        domain_third_choice: record.domainThirdChoice || null,
      },
    });
    return { customer, onboarding };
  } catch (error) {
    console.error("Onboarding record save failed");
    return null;
  }
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
  const stripeEnv = getStripeEnv();
  const secret = stripeEnv.secret;
  const publishableKey = stripeEnv.publishableKey;
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
  const address = sanitize(body.address, 240);
  const existingLinks = sanitize(body.existingLinks, 1000);
  const signerName = sanitize(body.signerName, 120);
  const agreementVersion =
    sanitize(body.agreementVersion, 80) || "service-agreement-v1";
  const companyInformation = sanitize(body.companyInformation, 2000);
  const logoName = sanitize(body.logoName, 160);
  const logoMimeType = sanitize(body.logoMimeType, 80);
  const logoBase64 = sanitize(body.logoBase64, 2_000_000);
  const signedAgreement = sanitize(body.signedAgreement, 20);
  const addOnIds = normalizeAddOns(body.addOns, tier);
  const domainPreferred = normalizeDomainInput(body.domainPreferred);
  const domainSecondChoice = normalizeDomainInput(body.domainSecondChoice);
  const domainThirdChoice = normalizeDomainInput(body.domainThirdChoice);

  if (!companyName || !contactName || !email || !signerName || !phone) {
    return json(400, { error: "Missing required onboarding fields" });
  }

  if (!isValidDomain(domainPreferred)) {
    return json(400, {
      error:
        "Enter a valid preferred domain (example: yourbusiness.com). You do not need to own it yet.",
    });
  }
  if (domainSecondChoice && !isValidDomain(domainSecondChoice)) {
    return json(400, { error: "Second-choice domain is not a valid domain name." });
  }
  if (domainThirdChoice && !isValidDomain(domainThirdChoice)) {
    return json(400, { error: "Third-choice domain is not a valid domain name." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Invalid email address" });
  }

  const origin = siteOrigin(request);
  const metadata = {
    tier: tier.id,
    company_name: companyName,
    email,
    contact_name: contactName,
    phone,
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
    performance_reports_requested: addOnIds.includes("performance_reports")
      ? "yes"
      : "no",
    admin_dashboard_requested: addOnIds.includes("admin_dashboard") ? "yes" : "no",
    domain_preferred: domainPreferred,
    domain_second_choice: domainSecondChoice || "",
    domain_third_choice: domainThirdChoice || "",
  };

  const saved = await saveOnboardingRecord({
    companyName,
    contactName,
    email,
    phone,
    tier: tier.id,
    companyInformation,
    signedAgreement: signedAgreement || "yes",
    addOnIds,
    existingLinks,
    logoName,
    domainPreferred,
    domainSecondChoice,
    domainThirdChoice,
  });
  const customerRow = saved && saved.customer;
  const onboardingRow = saved && saved.onboarding;
  if (customerRow && customerRow.id) {
    metadata.supabase_customer_id = customerRow.id;
  }
  if (onboardingRow && onboardingRow.id) {
    metadata.supabase_onboarding_id = onboardingRow.id;
  }

  if (!saved || !saved.customer) {
    return json(503, {
      error: "Unable to save onboarding information. Please try again.",
    });
  }

  try {
    await sendOnboardingPendingEmails({
      companyName,
      contactName,
      email,
      phone,
      tier: tier.id,
      companyInformation,
      addOnSummary: addOnSummary(addOnIds) || "None",
      logoName,
      domainPreferred,
      domainSecondChoice,
      domainThirdChoice,
    });
    if (logoBase64 && logoName) {
      try {
        const logoBuffer = Buffer.from(logoBase64, "base64");
        if (logoBuffer.length > 0 && logoBuffer.length <= 1.2 * 1024 * 1024) {
          await attachLogoToStaticForms({
            contactName,
            email,
            companyName,
            logoBuffer,
            logoName,
            logoMimeType,
          });
        }
      } catch (error) {
        console.error("Logo email attachment failed:", error.message);
      }
    }
  } catch (error) {
    console.error("Onboarding notification emails failed:", error.message);
    return json(502, {
      error:
        "Your information was saved but we could not send confirmation emails. Please contact us before paying.",
    });
  }

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
    try {
      await recordPendingCheckoutPayment({
        session,
        customerId: customerRow && customerRow.id,
        tierId: tier.id,
        description: `${companyName} · ${tier.id}`,
      });
    } catch (error) {
      console.error("Pending payment save failed");
    }
    return json(200, {
      url: session.url,
      sessionId: session.id,
      publishableKey,
      liveMode: stripeEnv.liveMode,
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return json(error.status || 500, {
      error: error.message || "Unable to start Stripe Checkout",
    });
  }
}
