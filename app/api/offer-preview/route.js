import { NextResponse } from "next/server";
import { addonById, normalizeAddOnIds } from "@/lib/pricing/add-ons";
import {
  PLAN_CENTS,
  PLAN_MODE,
  checkoutTotals,
  formatUsd,
  resolveFirstMonthOffer,
} from "@/lib/pricing/first-month-offer";
import { checkRateLimit, clientIp } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const rate = checkRateLimit(`offer-preview:${clientIp(request)}`, { limit: 40, windowMs: 10 * 60 * 1000 });
  if (rate.limited) return json(429, { error: "Please wait a moment and try again." });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const tier = String(body.tier || "").trim();
  if (!Object.prototype.hasOwnProperty.call(PLAN_CENTS, tier)) {
    return json(400, { error: "Invalid plan selection" });
  }
  const mode = PLAN_MODE[tier];
  const addOnIds = normalizeAddOnIds(body.addOns, mode).filter((id) => {
    if (id !== "admin_dashboard") return true;
    return tier !== "tier2" && tier !== "tier4" && tier !== "buyout-tier2";
  });
  const addonCents = addOnIds.reduce((sum, id) => sum + (addonById(id)?.cents || 0), 0);
  const offer = resolveFirstMonthOffer({
    offer: body.offer,
    businessAddress: body.businessAddress,
    addressAttested: body.addressAttested,
    serviceBranch: body.serviceBranch,
    mode,
  });
  const totals = checkoutTotals({
    tierCents: PLAN_CENTS[tier],
    addonCents,
    local: offer.local,
    responder: offer.responder,
    mode,
  });
  return json(200, {
    tier,
    percent: totals.discountCents > 0 ? 1 : 0,
    discountLabel: totals.discountLabel,
    dueTodayCents: totals.dueToday,
    renewalCents: totals.renewal,
    launchFeeCents: totals.launchFeeCents,
    firstMonthCents: mode === "subscription" ? totals.discountedTier : totals.fullTier,
    firstMonthLabel: mode === "subscription" ? formatUsd(totals.discountedTier) : "Included in buy-out",
    dueLabel: totals.dueLabel,
    thenLabel: totals.thenLabel,
  });
}
