export const LAUNCH_FEE_CENTS = 20000;

export const PLAN_CENTS = {
  tier1: 9900,
  tier2: 22500,
  tier3: 39900,
  tier4: 4400,
  "buyout-tier1": 9900 * 24,
  "buyout-tier2": 22500 * 24,
  "buyout-tier3": 39900 * 24,
  "buyout-tier4": 4400 * 24,
};

export const PLAN_MODE = {
  tier1: "subscription",
  tier2: "subscription",
  tier3: "subscription",
  tier4: "subscription",
  "buyout-tier1": "payment",
  "buyout-tier2": "payment",
  "buyout-tier3": "payment",
  "buyout-tier4": "payment",
};

export const COUPON_ENV_BY_PERCENT = {
  10: "STRIPE_COUPON_FIRST_MONTH_10",
  20: "STRIPE_COUPON_FIRST_MONTH_20",
  30: "STRIPE_COUPON_FIRST_MONTH_30",
};

export const RECORDED_SUBSCRIBER_STATUSES = new Set(["active", "paused", "churned"]);

export function formatUsd(cents) {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(Number(cents) || 0));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  const text = remainder === 0 ? `$${grouped}` : `$${grouped}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

function flagged(value) {
  return value === true || value === "yes" || value === "true" || value === "on";
}

/**
 * The browser may select an offer and send eligibility text.
 * Percentages, prices, and coupon IDs in the request are ignored.
 * A local business discount is applied first, then the military or
 * first-responder discount. $44 with both is $31.68, not a flat 30% off.
 */
export function discountedSubscriptionCents(fullCents, local, responder) {
  let amount = Math.round(Number(fullCents) || 0);
  if (local) amount = Math.round((amount * 90) / 100);
  if (responder) amount = Math.round((amount * 80) / 100);
  return amount;
}

export function resolveFirstMonthOffer(input = {}) {
  const offer = ["local", "service", "both"].includes(input.offer) ? input.offer : "";
  const mode = input.mode === "payment" ? "payment" : input.mode === "subscription" ? "subscription" : "";
  const address = String(input.businessAddress || "").trim().slice(0, 300);
  const service = String(input.serviceBranch || "").trim().slice(0, 120);
  const attested = flagged(input.addressAttested);
  const wantsLocal = offer === "local" || offer === "both";
  const wantsService = offer === "service" || offer === "both";
  const local = mode !== "payment" && wantsLocal && address.length > 0 && attested;
  const responder = mode !== "payment" && wantsService && service.length > 0;
  return { offer, mode, address, service, attested, local, responder };
}

export function discountLabel(local, responder) {
  if (local && responder) return "10% local, then 20% military or first responder, for the life of the subscription";
  if (local) return "10% off the monthly plan for the life of the subscription";
  if (responder) return "20% off the monthly plan for the life of the subscription";
  return "";
}

export function checkoutTotals({ tierCents, addonCents = 0, local = false, responder = false, mode = "subscription" }) {
  const monthly = mode === "subscription";
  const fullTier = Math.round(Number(tierCents) || 0);
  const addons = monthly ? Math.round(Number(addonCents) || 0) : 0;
  const discountedTier = monthly ? discountedSubscriptionCents(fullTier, local, responder) : fullTier;
  const discountCents = fullTier - discountedTier;
  const dueToday = discountedTier + addons + LAUNCH_FEE_CENTS;
  const renewal = monthly ? discountedTier + addons : 0;
  const label = monthly ? discountLabel(local, responder) : "";
  const dueLabel = monthly
    ? label
      ? `Due today: ${formatUsd(dueToday)} (${formatUsd(discountedTier)} plan after ${label}, ${formatUsd(addons)} add-ons, $200 launch fee)`
      : `Due today: ${formatUsd(dueToday)} (${formatUsd(fullTier + addons)} first month + $200 launch fee)`
    : `Due today: ${formatUsd(dueToday)} (buy-out + $200 launch fee)`;
  const thenLabel = monthly
    ? label
      ? `Then ${formatUsd(renewal)}/month for the life of this subscription`
      : `Then ${formatUsd(renewal)}/month`
    : "No monthly fee";
  return {
    discountPercent: discountCents > 0 ? 1 : 0,
    fullTier,
    discountedTier,
    discountCents,
    addons,
    launchFeeCents: LAUNCH_FEE_CENTS,
    dueToday,
    renewal,
    dueLabel,
    thenLabel,
    discountLabel: label,
  };
}

export function couponIsSafe({ coupon, tierProductId, allowedProductIds }) {
  const products = coupon && coupon.applies_to && Array.isArray(coupon.applies_to.products) ? coupon.applies_to.products : [];
  const allowed = new Set(allowedProductIds || []);
  const percentOff = Number(coupon && coupon.percent_off);
  if (!coupon || coupon.duration !== "once" || coupon.amount_off) return false;
  if (!Number.isInteger(percentOff) || ![10, 20, 30].includes(percentOff)) return false;
  if (!tierProductId || products.length === 0 || !products.includes(tierProductId)) return false;
  return products.every((productId) => allowed.has(productId));
}

export function subscriptionBlocksOffer(status) {
  // Any Stripe subscription record, including a canceled one, means this
  // email already started a subscription. An abandoned checkout has no record.
  return String(status || "").trim().length > 0;
}
