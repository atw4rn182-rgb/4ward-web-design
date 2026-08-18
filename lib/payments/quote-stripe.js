import { stripeRequest } from "@/lib/stripe/request";
import { getStripeEnv } from "@/lib/stripe/env";

function siteOrigin() {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }
  return "https://4wardwebdesign.com";
}

function metadataParams(prefix, metadata) {
  const out = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    out[`${prefix}[${key}]`] = String(value).slice(0, 500);
  });
  return out;
}

export function isQuoteCheckoutSession(session) {
  const metadata = (session && session.metadata) || {};
  return (
    metadata.kind === "quote_payment" ||
    Boolean(metadata.quote_request_id)
  );
}

export async function createQuotePaymentLink(quote, amountCents) {
  const { secret } = getStripeEnv();
  if (!secret) {
    throw new Error("Stripe is not configured.");
  }
  if (!quote || !quote.id) {
    throw new Error("Quote not found.");
  }
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    throw new Error("Amount must be at least $0.50.");
  }

  const label = quote.company_name || quote.contact_name || quote.email;
  const productName = `${quote.service} — ${label}`.slice(0, 120);
  const description = [
    quote.quantity ? `Quantity: ${quote.quantity}` : null,
    "Custom quote from 4Ward Web Design",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);

  const metadata = {
    kind: "quote_payment",
    quote_request_id: quote.id,
    contact_name: quote.contact_name || "",
    company_name: quote.company_name || "",
    email: quote.email || "",
    service: quote.service || "",
    quoted_amount_cents: String(amountCents),
  };

  const params = {
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": quote.currency || "usd",
    "line_items[0][price_data][unit_amount]": amountCents,
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][price_data][product_data][description]": description,
    ...metadataParams("line_items[0][price_data][product_data][metadata]", metadata),
    ...metadataParams("metadata", metadata),
    ...metadataParams("payment_intent_data[metadata]", metadata),
    "after_completion[type]": "hosted_confirmation",
    "after_completion[hosted_confirmation][custom_message]":
      "Thank you — 4Ward Web Design received your payment.",
    "allow_promotion_codes": "false",
    "billing_address_collection": "auto",
    "customer_creation": "always",
  };

  if (quote.email) {
    params["restrictions[completed_sessions][limit]"] = 1;
  }

  const origin = siteOrigin();
  params["custom_text[submit][message]"] = `Pay ${(amountCents / 100).toFixed(2)} USD securely through Stripe.`;

  const paymentLink = await stripeRequest(secret, "/payment_links", params);

  return {
    paymentLinkId: paymentLink.id,
    paymentUrl: paymentLink.url,
    amountCents,
  };
}
