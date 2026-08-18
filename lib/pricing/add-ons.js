/** Recurring website add-ons — single source of truth for server-side pricing. */
export const RECURRING_ADDONS = [
  {
    id: "performance_reports",
    stripeName: "Monthly Performance Reports",
    label: "Monthly Performance Reports",
    summaryLabel: "Monthly Performance Reports — $20/month",
    cents: 2000,
  },
  {
    id: "admin_dashboard",
    stripeName: "Private Admin Dashboard",
    label: "Private Admin Dashboard",
    summaryLabel: "Private Admin Dashboard — $50/month",
    cents: 5000,
  },
];

/** @deprecated legacy ID from prior pricing */
const LEGACY_ALIASES = {
  reports: "performance_reports",
};

const ADDON_BY_ID = Object.fromEntries(RECURRING_ADDONS.map((a) => [a.id, a]));
export const ADDON_ID_SET = new Set(RECURRING_ADDONS.map((a) => a.id));

export function addonById(id) {
  return ADDON_BY_ID[id] || null;
}

export function resolveAddOnId(raw) {
  const id = String(raw || "").trim();
  if (ADDON_ID_SET.has(id)) return id;
  return LEGACY_ALIASES[id] || null;
}

export function normalizeAddOnIds(raw, tierMode) {
  if (tierMode !== "subscription") return [];
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach((value) => {
    const id = resolveAddOnId(value);
    if (id && !out.includes(id)) out.push(id);
  });
  return out;
}

export function addOnMonthlyCents(addOnIds) {
  return addOnIds.reduce((sum, id) => sum + (addonById(id)?.cents || 0), 0);
}

export function addOnSummary(addOnIds) {
  return addOnIds
    .map((id) => addonById(id)?.summaryLabel)
    .filter(Boolean)
    .join(", ");
}

export function addOnPayloadFlags(addOnIds) {
  return {
    addons: addOnIds,
    performance_reports_requested: addOnIds.includes("performance_reports"),
    admin_dashboard_requested: addOnIds.includes("admin_dashboard"),
  };
}
