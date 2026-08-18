const TIER_LABELS = {
  tier1: "Tier 1 — Single Page Website",
  tier2: "Tier 2 — Two-Page Customized Site",
  tier3: "Tier 3 — Multi-Page Multi-Department Website",
  "buyout-tier1": "Tier 4 Buy-Out — 2 years of Tier 1",
  "buyout-tier2": "Tier 4 Buy-Out — 2 years of Tier 2",
  "buyout-tier3": "Tier 4 Buy-Out — 2 years of Tier 3",
};

export function tierLabel(tierId) {
  return TIER_LABELS[tierId] || tierId || "Selected plan";
}

export { TIER_LABELS };
