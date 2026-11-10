import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase/service-rest";
import { recordPendingCheckoutPayment } from "@/lib/payments/sync-stripe-session";
import { logPaymentPersistenceFailure } from "@/lib/payments/persistence-log";
import { getStripeEnv } from "@/lib/stripe/env";
import { stripeCustomerFailure } from "@/lib/stripe/customer-error";
import { attachLogoToStaticForms } from "@/lib/email/static-forms";
import { deliverOnboardingPendingEmails } from "@/lib/onboarding/deliver-pending-emails";
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
import { checkRateLimit, clientIp } from "@/lib/api/rate-limit";
import {
  COUPON_ENV_BY_PERCENT,
  couponIsSafe,
  checkoutTotals,
  resolveFirstMonthOffer,
  RECORDED_SUBSCRIBER_STATUSES,
  subscriptionBlocksOffer,
} from "@/lib/pricing/first-month-offer";

const TIERS = {
  tier1: {
    id: "tier1",
    name: "Tier 1 — Small Business Starter",
    amount: 9900,
    mode: "subscription",
  },
  tier2: {
    id: "tier2",
    name: "Tier 2 — E-Commerce & Business Management",
    amount: 22500,
    mode: "subscription",
  },
  tier3: {
    id: "tier3",
    name: "Tier 3 — Advanced Multi-Department Business",
    amount: 39900,
    mode: "subscription",
  },
  tier4: {
    id: "tier4",
    name: "Tier 4 — Online Flyer",
    amount: 4400,
    mode: "subscription",
  },
  "buyout-tier1": {
    id: "buyout-tier1",
    name: "Upfront buyout — 2 years of Tier 1",
    amount: 9900 * 24,
    mode: "payment",
    baseTier: "tier1",
  },
  "buyout-tier2": {
    id: "buyout-tier2",
    name: "Upfront buyout — 2 years of Tier 2",
    amount: 22500 * 24,
    mode: "payment",
    baseTier: "tier2",
  },
  "buyout-tier3": {
    id: "buyout-tier3",
    name: "Upfront buyout — 2 years of Tier 3",
    amount: 39900 * 24,
    mode: "payment",
    baseTier: "tier3",
  },
  "buyout-tier4": {
    id: "buyout-tier4",
    name: "Upfront buyout — 2 years of Tier 4",
    amount: 4400 * 24,
    mode: "payment",
    baseTier: "tier4",
  },
};

const LAUNCH_FEE_CENTS = 20000;
const LAUNCH_FEE_DESCRIPTION =
  "One-time kickoff: consultation, custom design/setup, domain/DNS if needed, basic on-page SEO, Google Analytics, contact forms, mobile optimization, testing, and onboarding.";

const PRICE_ENV = {
  tier1: "STRIPE_PRICE_TIER1",
  tier2: "STRIPE_PRICE_TIER2",
  tier3: "STRIPE_PRICE_TIER3",
  tier4: "STRIPE_PRICE_TIER4",
};

const ACCEPTED_AGREEMENT_VERSIONS = new Set(["service-agreement-v1"]);
const AGREEMENT_REQUIRED_MESSAGE =
  "Please read and accept the service agreement before continuing to payment.";

// Supabase is not allowed to hold up checkout longer than this; Stripe metadata
// carries the reconciliation context if the onboarding save does not finish.
const PRE_CHECKOUT_SUPABASE_TIMEOUT_MS = 6000;
const PENDING_PAYMENT_SUPABASE_TIMEOUT_MS = 4000;

function normalizeAddOns(raw, tier) {
  const ids = normalizeAddOnIds(raw, tier && tier.mode);
  if (tier && tier.id === "tier4") return ids.filter((id) => id !== "admin_dashboard");
  return ids;
}

function websiteLanguageCode(body) {
  const choice = sanitize(body && body.websiteLanguages, 20);
  const single = sanitize(body && body.websiteLanguage, 10);
  if (choice === "both") return "en-es";
  if (choice === "one" && (single === "en" || single === "es")) return single;
  return "";
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

async function stripeGet(secret, path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Stripe request failed");
    error.status = response.status;
    throw error;
  }
  return data;
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

function addonCents(addOnIds) {
  return addOnIds.reduce((sum, id) => sum + (addonById(id)?.cents || 0), 0);
}

function stripeProductId(product) {
  if (typeof product === "string") return product;
  if (product && typeof product.id === "string") return product.id;
  return "";
}

async function listStripePages(secret, path) {
  const rows = [];
  let startingAfter = "";
  for (let page = 0; page < 3; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const cursor = startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : "";
    const listed = await stripeGet(secret, `${path}${separator}limit=100${cursor}`);
    const data = Array.isArray(listed.data) ? listed.data : [];
    rows.push(...data);
    if (!listed.has_more) return rows;
    const next = data.length ? data[data.length - 1].id : "";
    if (!next || next === startingAfter) break;
    startingAfter = next;
  }
  const error = new Error("Stripe history was truncated");
  throw error;
}

async function offerBlockedByHistory(email, secret) {
  const customers = await supabaseSelect(
    "customers",
    `email=eq.${encodeURIComponent(email)}&select=id,status&limit=20`,
    { signal: AbortSignal.timeout(PRE_CHECKOUT_SUPABASE_TIMEOUT_MS) }
  );
  if (customers.some((row) => RECORDED_SUBSCRIBER_STATUSES.has(row.status))) return "customer";
  for (const row of customers) {
    if (!row.id) continue;
    const payments = await supabaseSelect(
      "payments",
      `customer_id=eq.${row.id}&status=eq.paid&payment_type=eq.subscription&select=id&limit=1`,
      { signal: AbortSignal.timeout(PRE_CHECKOUT_SUPABASE_TIMEOUT_MS) }
    );
    if (payments.length) return "payment";
  }
  const listed = await listStripePages(secret, `/customers?email=${encodeURIComponent(email)}`);
  for (const customer of listed) {
    if (!customer.id) continue;
    const subscriptions = await listStripePages(
      secret,
      `/subscriptions?customer=${encodeURIComponent(customer.id)}&status=all`
    );
    if (subscriptions.some((subscription) => subscription?.id || subscriptionBlocksOffer(subscription?.status))) {
      return "stripe";
    }
  }
  return "";
}

async function tierProductIds(secret) {
  const products = new Map();
  for (const [tierId, envName] of Object.entries(PRICE_ENV)) {
    const priceId = String(process.env[envName] || "").trim();
    if (!priceId) continue;
    const price = await stripeGet(secret, `/prices/${encodeURIComponent(priceId)}`);
    const productId = stripeProductId(price && price.product);
    if (productId) products.set(tierId, { priceId, productId });
  }
  return products;
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

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findReusablePendingOnboarding(email, options) {
  const customer = first(
    await supabaseSelect(
      "customers",
      `email=eq.${encodeURIComponent(email)}&status=eq.payment_pending&select=id&order=created_at.desc&limit=1`,
      options
    )
  );
  if (!customer || !customer.id) return null;

  const onboarding = first(
    await supabaseSelect(
      "onboarding_submissions",
      `customer_id=eq.${customer.id}&status=eq.payment_pending&select=id&order=created_at.desc&limit=1`,
      options
    )
  );
  if (!onboarding || !onboarding.id) return null;

  return { customer, onboarding };
}

/**
 * Returns whatever rows were saved before any failure (`error` is set when the
 * save did not complete) so partial IDs still reach Stripe metadata.
 */
async function saveOnboardingRecord(record, options = {}) {
  const result = { customer: null, onboarding: null, reused: false, error: null };
  try {
    const customerPayload = {
      company_name: record.companyName,
      contact_name: record.contactName,
      email: record.email,
      phone: record.phone,
      status: "payment_pending",
    };
    const onboardingPayload = {
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
        onboarding_ref: record.onboardingRef,
        agreement_version: record.agreementVersion,
        agreement_signed_at: record.agreementSignedAt,
        website_languages: record.websiteLanguages || "",
      },
    };

    const reusable = await findReusablePendingOnboarding(record.email, options);
    if (reusable) {
      result.reused = true;
      result.customer = reusable.customer;
      const customer = await supabasePatch(
        "customers",
        `id=eq.${reusable.customer.id}`,
        customerPayload,
        options
      );
      result.customer = customer || reusable.customer;
      const onboarding = await supabasePatch(
        "onboarding_submissions",
        `id=eq.${reusable.onboarding.id}`,
        { ...onboardingPayload, customer_id: reusable.customer.id },
        options
      );
      result.onboarding = onboarding || reusable.onboarding;
      return result;
    }

    result.customer = await supabaseInsert("customers", customerPayload, options);
    result.onboarding = await supabaseInsert(
      "onboarding_submissions",
      {
        ...onboardingPayload,
        customer_id: result.customer && result.customer.id ? result.customer.id : null,
      },
      options
    );
    return result;
  } catch (error) {
    result.error = error;
    return result;
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

  const honeypot = sanitize(body._hp_ref, 200);
  if (honeypot) {
    return json(200, { ok: true, skipped: "spam" });
  }

  const rate = checkRateLimit(`checkout:${clientIp(request)}`);
  if (rate.limited) {
    return json(429, {
      error: "Too many checkout attempts. Please wait a few minutes and try again.",
      retryAfterSec: rate.retryAfterSec,
    });
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

  if (signedAgreement !== "yes" || !ACCEPTED_AGREEMENT_VERSIONS.has(agreementVersion)) {
    return json(400, { error: AGREEMENT_REQUIRED_MESSAGE });
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

  const websiteLanguages = websiteLanguageCode(body);
  if (!websiteLanguages) {
    return json(400, {
      error: "Choose English and Spanish, or one language, before continuing to payment.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Invalid email address" });
  }

  const offer = resolveFirstMonthOffer({
    offer: body.offer,
    businessAddress: body.businessAddress,
    addressAttested: body.addressAttested,
    serviceBranch: body.serviceBranch,
    mode: tier.mode,
  });
  const totals = checkoutTotals({
    tierCents: tier.amount,
    addonCents: addonCents(addOnIds),
    percent: offer.percent,
    mode: tier.mode,
  });
  let offerCouponId = "";
  if (offer.percent > 0) {
    try {
      const blocked = await offerBlockedByHistory(email, secret);
      if (blocked) {
        return json(400, {
          error: "This first-month offer is only for a new subscription. A current or former subscription is already on file for this email.",
        });
      }
      const products = await tierProductIds(secret);
      const tierPrice = products.get(tier.id);
      const couponId = String(process.env[COUPON_ENV_BY_PERCENT[offer.percent]] || "").trim();
      if (!tierPrice || !couponId) {
        return json(503, {
          error: "The first-month offer is not configured yet. Checkout was not started.",
        });
      }
      const coupon = await stripeGet(secret, `/coupons/${encodeURIComponent(couponId)}?expand[]=applies_to`);
      if (
        Number(coupon.percent_off) !== offer.percent ||
        !couponIsSafe({
          coupon,
          tierProductId: tierPrice.productId,
          allowedProductIds: [...products.values()].map((item) => item.productId),
        })
      ) {
        return json(503, {
          error: "The first-month offer cannot be applied safely. Checkout was not started.",
        });
      }
      offerCouponId = couponId;
    } catch {
      return json(503, {
        error: "The first-month offer could not be confirmed. Checkout was not started.",
      });
    }
  }

  const origin = siteOrigin(request);
  const onboardingRef = crypto.randomUUID();
  const agreementSignedAt = new Date().toISOString();
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
    agreement_signed_at: agreementSignedAt,
    signed_agreement: signedAgreement,
    onboarding_ref: onboardingRef,
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
    website_languages: websiteLanguages,
    offer: offer.offer,
    offer_address: offer.address,
    offer_attested: offer.attested ? "yes" : "no",
    offer_service: offer.service,
    first_month_percent: String(totals.discountPercent),
  };

  const saved = await saveOnboardingRecord(
    {
      companyName,
      contactName,
      email,
      phone,
      tier: tier.id,
      companyInformation,
      signedAgreement,
      addOnIds,
      existingLinks,
      logoName,
      domainPreferred,
      domainSecondChoice,
      domainThirdChoice,
      websiteLanguages,
      onboardingRef,
      agreementVersion,
      agreementSignedAt,
    },
    { signal: AbortSignal.timeout(PRE_CHECKOUT_SUPABASE_TIMEOUT_MS) }
  );
  const customerRow = saved.customer;
  const onboardingRow = saved.onboarding;
  if (customerRow && customerRow.id) {
    metadata.supabase_customer_id = customerRow.id;
  }
  if (onboardingRow && onboardingRow.id) {
    metadata.supabase_onboarding_id = onboardingRow.id;
  }
  metadata.supabase_persisted = saved.error
    ? metadata.supabase_customer_id || metadata.supabase_onboarding_id
      ? "partial"
      : "no"
    : "yes";

  if (saved.error) {
    logPaymentPersistenceFailure(
      "pre_checkout_onboarding_save_failed",
      {
        onboarding_ref: onboardingRef,
        tier: tier.id,
        supabase_customer_id: metadata.supabase_customer_id,
        supabase_onboarding_id: metadata.supabase_onboarding_id,
        supabase_persisted: metadata.supabase_persisted,
        continuing_to_stripe: true,
      },
      saved.error
    );
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
      ...(offerCouponId ? { "discounts[0][coupon]": offerCouponId } : { allow_promotion_codes: "true" }),
      "custom_text[submit][message]":
        tier.mode === "subscription"
          ? totals.discountPercent > 0
            ? `Today you pay the $200 Launch Fee plus the first month after ${totals.discountPercent}% off the plan. The regular monthly price starts on the next bill. The launch fee is not discounted.`
            : "Today you pay the $200 Launch Fee plus the first month of your plan."
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
    if (customerRow && customerRow.id) {
      try {
        await recordPendingCheckoutPayment(
          {
            session,
            customerId: customerRow.id,
            tierId: tier.id,
            description: `${companyName} · ${tier.id}`,
          },
          { signal: AbortSignal.timeout(PENDING_PAYMENT_SUPABASE_TIMEOUT_MS) }
        );
      } catch (error) {
        logPaymentPersistenceFailure(
          "pending_payment_save_failed",
          {
            checkout_session_id: session.id,
            stripe_customer_id: customer.id,
            onboarding_ref: onboardingRef,
            supabase_customer_id: customerRow.id,
            note: "webhook will create the payment row",
          },
          error
        );
      }
    }

    deliverOnboardingPendingEmails({
      onboardingId: onboardingRow && onboardingRow.id,
      onboardingRef,
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
    })
      .then(() => {
        if (logoBase64 && logoName) {
          const logoBuffer = Buffer.from(logoBase64, "base64");
          if (logoBuffer.length > 0 && logoBuffer.length <= 1.2 * 1024 * 1024) {
            return attachLogoToStaticForms({
              contactName,
              email,
              companyName,
              logoBuffer,
              logoName,
              logoMimeType,
            });
          }
        }
      })
      .catch((err) => console.error("Onboarding notification emails failed:", err.message));

    return json(200, {
      url: session.url,
      sessionId: session.id,
      publishableKey,
      liveMode: stripeEnv.liveMode,
    });
  } catch (error) {
    const failure = stripeCustomerFailure("Stripe checkout error:", error);
    return json(failure.status, failure.body);
  }
}
