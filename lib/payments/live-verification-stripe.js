import { stripeRequest } from "@/lib/stripe/request";
import { getStripeEnv } from "@/lib/stripe/env";

export const LIVE_VERIFICATION_KIND = "live_verification_payment";
export const LIVE_VERIFICATION_AMOUNT_CENTS = 100;
export const LIVE_VERIFICATION_DESCRIPTION = "LIVE PAYMENT VERIFICATION";

function siteOrigin() {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }
  return "https://www.4wardwebdesign.com";
}

function metadataParams(prefix, metadata) {
  const out = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    out[`${prefix}[${key}]`] = String(value).slice(0, 500);
  });
  return out;
}

export function isLiveVerificationCheckoutSession(session) {
  const metadata = (session && session.metadata) || {};
  return metadata.kind === LIVE_VERIFICATION_KIND;
}

export async function createLiveVerificationCheckoutSession({ adminEmail } = {}) {
  const { secret, secretKind } = getStripeEnv();
  if (!secret) {
    throw new Error("Stripe is not configured.");
  }
  if (secretKind !== "live") {
    throw new Error("Live Stripe mode is required for verification payments.");
  }

  const origin = siteOrigin();
  const metadata = {
    kind: LIVE_VERIFICATION_KIND,
    initiated_by: adminEmail || "",
  };

  const params = {
    mode: "payment",
    success_url: `${origin}/?live_verification=success`,
    cancel_url: `${origin}/?live_verification=canceled`,
    billing_address_collection: "auto",
    allow_promotion_codes: "false",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": LIVE_VERIFICATION_AMOUNT_CENTS,
    "line_items[0][price_data][product_data][name]": "Live payment verification",
    "line_items[0][price_data][product_data][description]":
      "Internal one-time $1.00 live Stripe webhook verification — not a customer product.",
    ...metadataParams("line_items[0][price_data][product_data][metadata]", metadata),
    ...metadataParams("metadata", metadata),
    ...metadataParams("payment_intent_data[metadata]", metadata),
    "custom_text[submit][message]":
      "One-time $1.00 internal live payment verification. This is not a website plan purchase.",
  };

  const session = await stripeRequest(secret, "/checkout/sessions", params);
  return {
    sessionId: session.id,
    url: session.url,
    livemode: session.livemode,
  };
}
