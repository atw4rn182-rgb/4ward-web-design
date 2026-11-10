const TIER_LABELS = {
  tier1: "Tier 1 — Small Business Starter",
  tier2: "Tier 2 — E-Commerce & Business Management",
  tier3: "Tier 3 — Advanced Multi-Department Business",
  tier4: "Tier 4 — Online Flyer",
  "buyout-tier1": "Upfront buyout — 2 years of Tier 1",
  "buyout-tier2": "Upfront buyout — 2 years of Tier 2",
  "buyout-tier3": "Upfront buyout — 2 years of Tier 3",
  "buyout-tier4": "Upfront buyout — 2 years of Tier 4",
};

export function tierLabel(tierId) {
  return TIER_LABELS[tierId] || tierId || "Selected plan";
}

export { TIER_LABELS };
