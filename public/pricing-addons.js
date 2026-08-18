(function (global) {
  var RECURRING_ADDONS = [
    {
      id: "performance_reports",
      label: "Monthly Performance Reports",
      summaryLabel: "Monthly Performance Reports — $20/month",
      cents: 2000,
    },
    {
      id: "admin_dashboard",
      label: "Private Admin Dashboard",
      summaryLabel: "Private Admin Dashboard — $50/month",
      cents: 5000,
    },
  ];

  var LEGACY_ALIASES = { reports: "performance_reports" };
  var BY_ID = {};
  RECURRING_ADDONS.forEach(function (addon) {
    BY_ID[addon.id] = addon;
  });

  function resolveAddOnId(raw) {
    var id = String(raw || "").trim();
    if (BY_ID[id]) return id;
    return LEGACY_ALIASES[id] || null;
  }

  function normalizeAddOnIds(raw, isSubscription) {
    if (!isSubscription) return [];
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    list.forEach(function (value) {
      var id = resolveAddOnId(value);
      if (id && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  function addOnMonthlyCents(ids) {
    return ids.reduce(function (sum, id) {
      return sum + (BY_ID[id] ? BY_ID[id].cents : 0);
    }, 0);
  }

  function addOnSummaryLines(ids) {
    return ids
      .map(function (id) {
        return BY_ID[id] ? BY_ID[id].summaryLabel : null;
      })
      .filter(Boolean);
  }

  global.FwdPricingAddons = {
    RECURRING_ADDONS: RECURRING_ADDONS,
    resolveAddOnId: resolveAddOnId,
    normalizeAddOnIds: normalizeAddOnIds,
    addOnMonthlyCents: addOnMonthlyCents,
    addOnSummaryLines: addOnSummaryLines,
  };
})(typeof window !== "undefined" ? window : globalThis);
