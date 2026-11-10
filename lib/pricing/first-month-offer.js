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
 */
export function resolveFirstMonthOffer(input = {}) {
  const offer = ["local", "service", "both"].includes(input.offer) ? input.offer : "";
  const mode = input.mode === "payment" ? "payment" : input.mode === "subscription" ? "subscription" : "";
  const address = String(input.businessAddress || "").trim().slice(0, 300);
  const service = String(input.serviceBranch || "").trim().slice(0, 120);
  const attested = flagged(input.addressAttested);
  const wantsLocal = offer === "local" || offer === "both";
  const wantsService = offer === "service" || offer === "both";
  const local = wantsLocal && address.length > 0 && attested;
  const responder = wantsService && service.length > 0;
  let percent = 0;
  if (mode !== "payment") {
    if (local) percent += 10;
    if (responder) percent += 20;
  }
  return { offer, mode, address, service, attested, local, responder, percent };
}

export function checkoutTotals({ tierCents, addonCents = 0, percent = 0, mode = "subscription" }) {
  const monthly = mode === "subscription";
  const discountPercent = monthly ? percent : 0;
  const fullTier = Math.round(Number(tierCents) || 0);
  const addons = monthly ? Math.round(Number(addonCents) || 0) : 0;
  const discountCents = monthly ? Math.round((fullTier * discountPercent) / 100) : 0;
  const discountedTier = fullTier - discountCents;
  const dueToday = (monthly ? discountedTier : fullTier) + addons + LAUNCH_FEE_CENTS;
  const renewal = monthly ? fullTier + addons : 0;
  const dueLabel = monthly
    ? discountPercent > 0
      ? `Due today: ${formatUsd(dueToday)} (${formatUsd(discountedTier)} first month after ${discountPercent}% off, ${formatUsd(addons)} add-ons, $200 launch fee)`
      : `Due today: ${formatUsd(dueToday)} (${formatUsd(fullTier + addons)} first month + $200 launch fee)`
    : `Due today: ${formatUsd(dueToday)} (buy-out + $200 launch fee)`;
  const thenLabel = monthly ? `Then ${formatUsd(renewal)}/month` : "No monthly fee";
  return {
    discountPercent,
    fullTier,
    discountedTier,
    discountCents,
    addons,
    launchFeeCents: LAUNCH_FEE_CENTS,
    dueToday,
    renewal,
    dueLabel,
    thenLabel,
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
