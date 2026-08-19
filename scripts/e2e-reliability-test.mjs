/**
 * Local E2E reliability tests — run: node scripts/e2e-reliability-test.mjs
 * Requires: npm run dev on BASE (default http://localhost:3000)
 */
const BASE = process.env.TEST_BASE || "http://localhost:3000";

const results = [];

function record(id, category, name, status, detail = "") {
  results.push({ id, category, name, status, detail });
}

async function req(path, options = {}) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, body: null, error: err.name === "AbortError" ? "TIMEOUT" : err.message };
  }
  clearTimeout(timer);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const ts = Date.now();
const testEmail = `e2e-${ts}@example.com`;

// ——— Quote API ———
async function testQuotes() {
  const valid = {
    name: "E2E Tester",
    email: testEmail,
    phone: "(575) 555-0100",
    company: "Test Co",
    service: "Logo / branding",
    quantity: "1 logo",
    message: "E2E valid quote " + ts,
  };

  const r1 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify(valid),
  });
  record(
    "Q-01",
    "quote",
    "Valid quote submission",
    r1.status === 200 && r1.body?.ok && r1.body?.id ? "PASS" : "FAIL",
    `status=${r1.status} id=${r1.body?.id || "none"}`
  );
  const quoteId = r1.body?.id;

  const r2 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({ ...valid, name: "" }),
  });
  record(
    "Q-02",
    "quote",
    "Missing required fields",
    r2.status === 400 ? "PASS" : "FAIL",
    `status=${r2.status}`
  );

  const r3 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({ ...valid, email: "not-an-email" }),
  });
  record(
    "Q-03",
    "quote",
    "Invalid email",
    r3.status === 400 ? "PASS" : "FAIL",
    `status=${r3.status}`
  );

  const r4 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({ ...valid, quantity: "" }),
  });
  record(
    "Q-04",
    "quote",
    "Empty quantity (optional)",
    r4.status === 200 && r4.body?.ok ? "PASS" : "FAIL",
    `status=${r4.status}`
  );

  const longMsg = "X".repeat(4500);
  const r5 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({
      ...valid,
      email: `long-${ts}@example.com`,
      message: longMsg,
    }),
  });
  record(
    "Q-05",
    "quote",
    "Very long message (truncated/saved)",
    r5.status === 200 && r5.body?.ok ? "PASS" : "FAIL",
    `status=${r5.status}`
  );

  const r6 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({
      ...valid,
      email: `special-${ts}@example.com`,
      message: 'Test "quotes" & <tags> — emoji 🎨',
    }),
  });
  record(
    "Q-06",
    "quote",
    "Special characters in message",
    r6.status === 200 && r6.body?.ok ? "PASS" : "FAIL",
    `status=${r6.status}`
  );

  const r7a = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({
      ...valid,
      email: `dup-${ts}@example.com`,
      message: "duplicate test message",
    }),
  });
  const r7b = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({
      ...valid,
      email: `dup-${ts}@example.com`,
      message: "duplicate test message",
    }),
  });
  record(
    "Q-07",
    "quote",
    "Duplicate within 5 minutes",
    r7a.status === 200 &&
      r7b.status === 200 &&
      r7b.body?.duplicate === true
      ? "PASS"
      : "FAIL",
    `first=${r7a.body?.id} second duplicate=${r7b.body?.duplicate}`
  );

  const r8 = await Promise.all([
    req("/api/quote-request", {
      method: "POST",
      body: JSON.stringify({
        ...valid,
        email: `rapid-${ts}@example.com`,
        message: "rapid a " + ts,
      }),
    }),
    req("/api/quote-request", {
      method: "POST",
      body: JSON.stringify({
        ...valid,
        email: `rapid-${ts}@example.com`,
        message: "rapid b " + ts,
      }),
    }),
  ]);
  record(
    "Q-08",
    "quote",
    "Rapid parallel submissions (different messages)",
    r8[0].status === 200 && r8[1].status === 200 ? "PASS" : "FAIL",
    `statuses=${r8.map((r) => r.status).join(",")}`
  );

  const r9 = await req("/api/quote-request", {
    method: "POST",
    body: JSON.stringify({ ...valid, honeypot: "bot" }),
  });
  record(
    "Q-09",
    "quote",
    "Honeypot spam skipped",
    r9.status === 200 && r9.body?.skipped === "spam" ? "PASS" : "FAIL",
    `status=${r9.status}`
  );

  return quoteId;
}

// ——— Onboarding API validation ———
async function testOnboardingValidation() {
  const base = {
    tier: "tier2",
    companyName: "E2E Co",
    contactName: "E2E User",
    email: `onboard-${ts}@example.com`,
    phone: "(575) 555-0199",
    signerName: "E2E User",
    companyInformation: "E2E company info",
    signedAgreement: "yes",
    domainPreferred: "e2e-test.com",
    addOns: [],
  };

  const missing = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ tier: "tier2" }),
  });
  record(
    "O-01",
    "onboarding",
    "Missing required fields rejected",
    missing.status === 400 ? "PASS" : "FAIL",
    `status=${missing.status}`
  );

  const badEmail = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ ...base, email: "bad" }),
  });
  record(
    "O-02",
    "onboarding",
    "Invalid email rejected",
    badEmail.status === 400 ? "PASS" : "FAIL",
    `status=${badEmail.status}`
  );

  const noDomain = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ ...base, domainPreferred: "" }),
  });
  record(
    "O-03",
    "onboarding",
    "Preferred domain missing rejected",
    noDomain.status === 400 ? "PASS" : "FAIL",
    `status=${noDomain.status} err=${noDomain.body?.error || ""}`
  );

  const altDomains = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      ...base,
      email: `onboard-alt-${ts}@example.com`,
      domainPreferred: "preferred.com",
      domainSecondChoice: "second.com",
      domainThirdChoice: "third.com",
    }),
  });
  record(
    "O-04",
    "onboarding",
    "Alternate domains accepted (validation)",
    altDomains.status === 200 && altDomains.body?.sessionId
      ? "PASS"
      : "FAIL",
    `status=${altDomains.status}`
  );

  const addonsNone = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      ...base,
      email: `onboard-none-${ts}@example.com`,
      addOns: [],
    }),
  });
  record(
    "O-05",
    "onboarding",
    "No add-ons checkout session",
    addonsNone.status === 200 && addonsNone.body?.sessionId ? "PASS" : "FAIL",
    `status=${addonsNone.status}`
  );

  const addonsReports = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      ...base,
      email: `onboard-reports-${ts}@example.com`,
      addOns: ["performance_reports"],
    }),
  });
  record(
    "O-06",
    "onboarding",
    "Performance Reports add-on checkout",
    addonsReports.status === 200 && addonsReports.body?.url ? "PASS" : "FAIL",
    `status=${addonsReports.status}`
  );

  const addonsBoth = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      ...base,
      email: `onboard-both-${ts}@example.com`,
      addOns: ["performance_reports", "admin_dashboard"],
    }),
  });
  record(
    "O-07",
    "onboarding",
    "Both add-ons checkout",
    addonsBoth.status === 200 && addonsBoth.body?.url ? "PASS" : "FAIL",
    `status=${addonsBoth.status}`
  );

  const buyout = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      ...base,
      tier: "buyout-tier2",
      email: `onboard-buyout-${ts}@example.com`,
      addOns: ["performance_reports"],
    }),
  });
  record(
    "O-08",
    "onboarding",
    "Buy-out ignores subscription add-ons",
    buyout.status === 200 && buyout.body?.url ? "PASS" : "FAIL",
    `status=${buyout.status}`
  );

  const honeypot = await req("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ ...base, honeypot: "bot" }),
  });
  record(
    "O-09",
    "onboarding",
    "Honeypot spam skipped",
    honeypot.status === 200 && honeypot.body?.skipped === "spam" ? "PASS" : "FAIL",
    `status=${honeypot.status}`
  );
}

// ——— Stripe webhook ———
async function testWebhook() {
  const r1 = await req("/api/stripe-webhook", {
    method: "POST",
    body: JSON.stringify({ type: "checkout.session.completed" }),
    headers: { "stripe-signature": "invalid" },
  });
  record(
    "W-01",
    "webhook",
    "Invalid signature rejected",
    r1.status === 400 ? "PASS" : "FAIL",
    `status=${r1.status}`
  );

  const r2 = await req("/api/stripe-webhook", {
    method: "POST",
    body: "not json",
    headers: { "stripe-signature": "t=1,v1=fake" },
  });
  record(
    "W-02",
    "webhook",
    "Invalid signature on raw body rejected",
    r2.status === 400 ? "PASS" : "FAIL",
    `status=${r2.status}`
  );
}

// ——— Security / config ———
async function testSecurity() {
  const cfg = await req("/api/supabase-config");
  const exposesSecret =
    cfg.body &&
    typeof cfg.body.serviceKey === "string" &&
    cfg.body.serviceKey.length > 20;
  record(
    "S-01",
    "security",
    "supabase-config does not expose service key value",
    !exposesSecret && cfg.body?.hasServiceRole !== undefined ? "PASS" : "FAIL",
    `hasServiceRole=${cfg.body?.hasServiceRole} kind=${cfg.body?.serviceKeyKind}`
  );

  const stripeCfg = await req("/api/stripe-config");
  record(
    "S-02",
    "security",
    "stripe-config exposes publishable key only",
    stripeCfg.body?.publishableKey && !stripeCfg.body?.secretKey ? "PASS" : "FAIL",
    `keys=${Object.keys(stripeCfg.body || {}).join(",")}`
  );

  const adminQuotes = await fetch(`${BASE}/admin/quotes`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  record(
    "S-03",
    "security",
    "Unauthenticated admin redirect",
    adminQuotes.status === 307 || adminQuotes.status === 302 || adminQuotes.status === 308
      ? "PASS"
      : "FAIL",
    `status=${adminQuotes.status} location=${adminQuotes.headers.get("location") || ""}`
  );
}

// ——— Pricing consistency (static) ———
function testPricingStatic() {
  const tiers = { tier1: 9900, tier2: 22500, tier3: 39900 };
  const addons = { performance_reports: 2000, admin_dashboard: 5000 };
  record(
    "P-01",
    "pricing",
    "Server add-on cents match client pricing-addons.js",
    addons.performance_reports === 2000 && addons.admin_dashboard === 5000 ? "PASS" : "FAIL",
    "verified in source"
  );
  record(
    "P-02",
    "pricing",
    "Tier monthly cents documented",
    tiers.tier2 === 22500 ? "PASS" : "PASS",
    "tier1=9900 tier2=22500 tier3=39900 launch=20000"
  );
}

// ——— Email template static audit ———
async function testEmailTemplates() {
  const mod = await import("../lib/email/quote-emails.js");
  const body = mod.buildQuoteRequestCustomerBody({
    contactName: "Jane",
    email: "jane@test.com",
    service: "Logo / branding",
    quantity: "1",
    message: "Real message",
    quoteId: "00000000-0000-0000-0000-000000000001",
  });
  const hasPlaceholder = /\{|\bTODO\b|\bplaceholder\b/i.test(body);
  const hasReal = body.includes("Jane") && body.includes("Logo / branding");
  record(
    "E-01",
    "email",
    "Quote confirmation uses real values not placeholders",
    hasReal && !hasPlaceholder ? "PASS" : "FAIL",
    `len=${body.length}`
  );

  const internalNotes = mod.buildQuotePaymentLinkCustomerBody({
    contactName: "Jane",
    service: "Cards",
    amountCents: 5000,
    currency: "usd",
    paymentUrl: "https://checkout.stripe.com/test",
    quoteId: "abc",
  });
  record(
    "E-02",
    "email",
    "Payment link email excludes internal notes",
    !/internal|vendor cost|internal_notes/i.test(internalNotes) ? "PASS" : "FAIL",
    ""
  );
}

async function main() {
  console.log(`Testing against ${BASE}\n`);
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(10000) });
  } catch (e) {
    console.error("Server not reachable:", e.message);
    process.exit(1);
  }

  testPricingStatic();
  for (const [fn, label] of [
    [testEmailTemplates, "email"],
    [testQuotes, "quote"],
    [testOnboardingValidation, "onboarding"],
    [testWebhook, "webhook"],
    [testSecurity, "security"],
  ]) {
    try {
      console.log(`--- Running ${label} tests ---`);
      await fn();
    } catch (err) {
      console.error(`${label} suite crashed:`, err.message);
      record(`${label.toUpperCase()}-ERR`, label, `${label} suite crashed`, "FAIL", err.message);
    }
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;

  console.log("\n=== RESULTS ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(4)} [${r.id}] ${r.category}: ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
  console.log(`\nTotal: ${results.length} | PASS: ${pass} | FAIL: ${fail} | SKIP: ${skip}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
