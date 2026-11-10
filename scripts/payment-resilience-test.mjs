/**
 * Offline payment-resilience tests for onboarding checkout + Stripe webhook.
 *
 * Runs the real route handlers in Node with `fetch` replaced by in-memory fakes
 * for Stripe, Supabase (PostgREST subset with the schema's unique/check
 * constraints), and Static Forms. No real network calls are made — unknown
 * hosts throw — so this is safe to run with any .env.
 *
 *   node scripts/payment-resilience-test.mjs
 */
import crypto from "node:crypto";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootUrl = pathToFileURL(root + path.sep).href;
const aliasHooks = `
export async function resolve(specifier, context, next) {
  if (specifier === "next/server") return next("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const base = ${JSON.stringify(rootUrl)} + specifier.slice(2);
    for (const ext of ["", ".js", "/index.js"]) {
      try { return await next(base + ext, context); } catch {}
    }
  }
  return next(specifier, context);
}`;
register("data:text/javascript," + encodeURIComponent(aliasHooks));

const SUPABASE_BASE = "https://fake-project.supabase.test";
const WEBHOOK_SECRET = "whsec_offline_test_secret";
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_BASE,
  SUPABASE_SERVICE_ROLE_KEY: "offline-service-role",
  STRIPE_SECRET_KEY: "sk_test_offline",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_offline",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STATIC_FORMS_API_KEY: "offline-static-forms",
  SITE_URL: "https://offline.test",
});
delete process.env.STRIPE_PRICE_TIER1;
delete process.env.STRIPE_PRICE_TIER2;
delete process.env.STRIPE_PRICE_TIER3;

// ---------------------------------------------------------------------------
// Fake Supabase (PostgREST subset)
// ---------------------------------------------------------------------------
const COLUMNS = {
  customers: ["id", "company_name", "contact_name", "email", "phone", "website_url", "city", "state", "status", "created_at", "updated_at"],
  onboarding_submissions: ["id", "customer_id", "tier", "company_name", "contact_name", "email", "phone", "website_url", "notes", "agreement_accepted", "payload", "status", "domain_preferred", "domain_second_choice", "domain_third_choice", "created_at", "updated_at"],
  payments: ["id", "customer_id", "website_project_id", "amount_cents", "currency", "status", "payment_type", "tier", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_customer_id", "description", "paid_at", "quote_request_id", "created_at", "updated_at"],
  website_projects: ["id", "customer_id", "name", "tier", "status", "live_url", "staging_url", "started_at", "launched_at", "created_at", "updated_at"],
  notes: ["id", "customer_id", "website_project_id", "onboarding_submission_id", "author_id", "body", "is_pinned", "created_at", "updated_at"],
  email_events: ["id", "event_key", "event_type", "recipient_email", "metadata", "status", "error_message", "quote_request_id", "created_at"],
};
const CHECKS = {
  customers: { status: ["lead", "payment_pending", "active", "paused", "churned"] },
  onboarding_submissions: { status: ["received", "payment_pending", "reviewed", "in_progress", "completed", "canceled"] },
  payments: {
    status: ["pending", "paid", "failed", "refunded", "canceled"],
    payment_type: ["subscription", "one_time", "buyout", "addon", "quote", "other"],
  },
};
const NOT_NULL = {
  customers: ["company_name"],
  onboarding_submissions: ["tier"],
  website_projects: ["customer_id", "name"],
  notes: ["body"],
  email_events: ["event_key", "event_type"],
  payments: ["amount_cents"],
};
const UNIQUE = {
  payments: [(r) => r.stripe_checkout_session_id || null],
  email_events: [(r) => r.event_key || null],
  // Mirrors supabase/migrations/009_payment_resilience.sql when applied.
  onboarding_submissions: [(r) => (r.payload && r.payload.onboarding_ref) || null],
};

const db = {};
let clock = Date.parse("2026-10-01T00:00:00Z");
const supa = { mode: "up", failWhen: null, migration009: true, calls: [] };

function resetDb() {
  for (const table of Object.keys(COLUMNS)) db[table] = [];
}

function fieldValue(row, key) {
  if (key.includes("->>")) {
    const [col, sub] = key.split("->>");
    const obj = row[col];
    return obj && obj[sub] !== undefined && obj[sub] !== null ? String(obj[sub]) : null;
  }
  return row[key];
}

function parseQuery(search) {
  const params = new URLSearchParams(search);
  const filters = [];
  let order = null;
  let limit = null;
  for (const [key, value] of params) {
    if (key === "select") continue;
    if (key === "order") {
      const [col, dir] = value.split(",")[0].split(".");
      order = { col, desc: dir === "desc" };
      continue;
    }
    if (key === "limit") {
      limit = Number(value);
      continue;
    }
    const dot = value.indexOf(".");
    filters.push({ key, op: value.slice(0, dot), arg: value.slice(dot + 1) });
  }
  return { filters, order, limit };
}

function matches(row, filters) {
  return filters.every(({ key, op, arg }) => {
    const v = fieldValue(row, key);
    if (op === "eq") return v !== null && v !== undefined && String(v) === arg;
    if (op === "is" && arg === "null") return v === null || v === undefined;
    throw new Error(`fake supabase: unsupported filter ${key}=${op}.${arg}`);
  });
}

function pgError(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validateRow(table, row) {
  for (const col of Object.keys(row)) {
    if (!COLUMNS[table].includes(col)) {
      return pgError(400, "PGRST204", `Could not find the '${col}' column of '${table}' in the schema cache`);
    }
  }
  for (const [col, allowed] of Object.entries(CHECKS[table] || {})) {
    if (row[col] !== undefined && row[col] !== null && !allowed.includes(row[col])) {
      return pgError(400, "23514", `new row for relation "${table}" violates check constraint "${table}_${col}_check"`);
    }
  }
  return null;
}

function uniqueViolation(table, candidate, ignoreId) {
  for (const keyOf of UNIQUE[table] || []) {
    if (table === "onboarding_submissions" && !supa.migration009) continue;
    const key = keyOf(candidate);
    if (key === null) continue;
    if (db[table].some((r) => r.id !== ignoreId && keyOf(r) === key)) {
      return pgError(409, "23505", `duplicate key value violates unique constraint on "${table}"`);
    }
  }
  return null;
}

async function fakeSupabase(url, init) {
  const method = (init && init.method) || "GET";
  const rel = url.pathname.replace(/^\/rest\/v1\//, "");
  const table = rel.split("/")[0];
  supa.calls.push(`${method} ${table}`);

  if (supa.mode === "down") throw new TypeError("fetch failed");
  if (supa.mode === "hang") {
    return new Promise((_, reject) => {
      const signal = init && init.signal;
      if (signal) {
        signal.addEventListener("abort", () => reject(signal.reason || new DOMException("aborted", "AbortError")));
      }
    });
  }
  if (supa.mode === "http503") return pgError(503, "PGRST000", "Service Unavailable");
  if (supa.failWhen && supa.failWhen(method, table)) return pgError(503, "PGRST000", "Injected failure");
  if (!COLUMNS[table]) return pgError(404, "42P01", `relation "${table}" does not exist`);

  const { filters, order, limit } = parseQuery(url.search);
  const body = init && init.body ? JSON.parse(init.body) : undefined;
  const ok = (rows) => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });

  if (method === "GET") {
    let rows = db[table].filter((r) => matches(r, filters));
    if (order) {
      rows = [...rows].sort((a, b) => (a[order.col] < b[order.col] ? -1 : a[order.col] > b[order.col] ? 1 : 0));
      if (order.desc) rows.reverse();
    }
    if (limit !== null) rows = rows.slice(0, limit);
    return ok(rows.map((r) => structuredClone(r)));
  }

  if (method === "POST") {
    const bad = validateRow(table, body);
    if (bad) return bad;
    for (const col of NOT_NULL[table] || []) {
      if (body[col] === undefined || body[col] === null) {
        return pgError(400, "23502", `null value in column "${col}" of relation "${table}" violates not-null constraint`);
      }
    }
    clock += 1000;
    const now = new Date(clock).toISOString();
    const row = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...structuredClone(body) };
    if (table === "onboarding_submissions" && !row.payload) row.payload = {};
    const dup = uniqueViolation(table, row, null);
    if (dup) return dup;
    db[table].push(row);
    return new Response(JSON.stringify([structuredClone(row)]), { status: 201 });
  }

  if (method === "PATCH") {
    const bad = validateRow(table, body);
    if (bad) return bad;
    const targets = db[table].filter((r) => matches(r, filters));
    for (const r of targets) {
      const dup = uniqueViolation(table, { ...r, ...body }, r.id);
      if (dup) return dup;
    }
    clock += 1000;
    for (const r of targets) Object.assign(r, structuredClone(body), { updated_at: new Date(clock).toISOString() });
    return ok(targets.map((r) => structuredClone(r)));
  }

  if (method === "DELETE") {
    const targets = db[table].filter((r) => matches(r, filters));
    db[table] = db[table].filter((r) => !targets.includes(r));
    return ok(targets.map((r) => structuredClone(r)));
  }

  return pgError(405, "PGRST000", "method not supported");
}

// ---------------------------------------------------------------------------
// Fake Stripe + Static Forms
// ---------------------------------------------------------------------------
const stripe = { calls: [], sessions: new Map(), failCheckout: false, counter: 0, subscriptionsByEmail: {} };
const TEST_PRICES = {
  price_test_tier1: { unit_amount: 9900, product: "prod_tier1" },
  price_test_tier2: { unit_amount: 22500, product: "prod_tier2" },
  price_test_tier3: { unit_amount: 39900, product: "prod_tier3" },
};
const TEST_COUPONS = {
  coupon_test_10: { id: "coupon_test_10", percent_off: 10, duration: "once", applies_to: { products: ["prod_tier1", "prod_tier2", "prod_tier3"] } },
  coupon_test_20: { id: "coupon_test_20", percent_off: 20, duration: "once", applies_to: { products: ["prod_tier1", "prod_tier2", "prod_tier3"] } },
  coupon_test_30: { id: "coupon_test_30", percent_off: 30, duration: "once", applies_to: { products: ["prod_tier1", "prod_tier2", "prod_tier3"] } },
  coupon_test_broad: { id: "coupon_test_broad", percent_off: 10, duration: "once", applies_to: { products: ["prod_tier2", "prod_launch"] } },
};
const emails = [];

function parseStripeForm(body) {
  const params = new URLSearchParams(String(body || ""));
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

function nested(params, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith(`${prefix}[`)) out[k.slice(prefix.length + 1, -1)] = v;
  }
  return out;
}

function lineAmount(params, index) {
  const priceId = params[`line_items[${index}][price]`];
  if (priceId && TEST_PRICES[priceId]) return TEST_PRICES[priceId].unit_amount;
  return Number(params[`line_items[${index}][price_data][unit_amount]`] || 0);
}

function lineProduct(params, index) {
  const priceId = params[`line_items[${index}][price]`];
  return priceId && TEST_PRICES[priceId] ? TEST_PRICES[priceId].product : "";
}

function lineItemsTotal(params) {
  const coupon = TEST_COUPONS[params["discounts[0][coupon]"] || ""] || null;
  let total = 0;
  for (let i = 0; params[`line_items[${i}][quantity]`] !== undefined; i += 1) {
    let amount = lineAmount(params, i);
    const product = lineProduct(params, i);
    const kind = params[`line_items[${i}][price_data][product_data][metadata][kind]`] || "";
    const discounted = coupon && product && coupon.applies_to.products.includes(product) && kind !== "launch_fee" && kind !== "addon";
    if (discounted) amount -= Math.round((amount * coupon.percent_off) / 100);
    total += amount * Number(params[`line_items[${i}][quantity]`]);
  }
  return total;
}

async function fakeStripe(url, init) {
  const method = (init && init.method) || "GET";
  const params = parseStripeForm(init && init.body);
  stripe.calls.push({ method, path: url.pathname, params });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (method === "GET" && url.pathname === "/v1/customers") {
    const email = url.searchParams.get("email");
    if (stripe.truncateEmail === email) {
      const page = url.searchParams.get("starting_after") || "start";
      return json(200, { data: [{ id: `cus_page_${page}`, email }], has_more: true });
    }
    const known = stripe.subscriptionsByEmail[email];
    return json(200, { data: known ? [{ id: known.customerId, email }] : [] });
  }
  if (method === "GET" && url.pathname === "/v1/subscriptions") {
    const customer = url.searchParams.get("customer");
    const known = Object.values(stripe.subscriptionsByEmail).find((row) => row.customerId === customer);
    return json(200, { data: known && known.status ? [{ id: known.subscriptionId || "sub_existing", status: known.status }] : [] });
  }
  if (method === "GET" && url.pathname.startsWith("/v1/prices/")) {
    const price = TEST_PRICES[decodeURIComponent(url.pathname.split("/").pop())];
    return price ? json(200, { id: url.pathname.split("/").pop(), ...price }) : json(404, { error: { message: "missing price" } });
  }
  if (method === "GET" && url.pathname.startsWith("/v1/coupons/")) {
    const coupon = TEST_COUPONS[decodeURIComponent(url.pathname.split("/").pop())];
    return coupon ? json(200, coupon) : json(404, { error: { message: "missing coupon" } });
  }
  if (method === "POST" && url.pathname === "/v1/customers") {
    stripe.counter += 1;
    return json(200, { id: `cus_test_${stripe.counter}`, email: params.email, metadata: nested(params, "metadata") });
  }
  if (method === "POST" && url.pathname === "/v1/checkout/sessions") {
    if (stripe.failCheckout) {
      return json(402, { error: { type: "invalid_request_error", message: "Offline injected Stripe failure" } });
    }
    stripe.counter += 1;
    const id = `cs_test_offline_${stripe.counter}`;
    const session = {
      id,
      object: "checkout.session",
      url: `https://checkout.stripe.com/c/pay/${id}`,
      mode: params.mode,
      customer: params.customer,
      client_reference_id: params.client_reference_id,
      amount_total: lineItemsTotal(params),
      currency: "usd",
      payment_status: "unpaid",
      status: "open",
      metadata: nested(params, "metadata"),
      subscription_metadata: nested(params, "subscription_data[metadata]"),
      payment_intent_metadata: nested(params, "payment_intent_data[metadata]"),
      _params: params,
    };
    stripe.sessions.set(id, session);
    return json(200, session);
  }
  if (method === "POST" && /^\/v1\/invoices\/[^/]+\/send$/.test(url.pathname)) {
    return json(200, { id: url.pathname.split("/")[3], status: "open" });
  }
  return json(404, { error: { message: `fake stripe: no route ${method} ${url.pathname}` } });
}

async function fakeStaticForms(_url, init) {
  const form = init && init.body;
  emails.push({ subject: form && form.get ? String(form.get("subject")) : "", requestType: form && form.get ? String(form.get("requestType") || form.get("emailKind") || "") : "" });
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.origin === SUPABASE_BASE) return fakeSupabase(url, init);
  if (url.host === "api.stripe.com") return fakeStripe(url, init);
  if (url.host === "api.staticforms.dev") return fakeStaticForms(url, init);
  throw new Error(`Blocked unexpected network call to ${url.host}`);
};

// ---------------------------------------------------------------------------
// Log capture
// ---------------------------------------------------------------------------
const logs = [];
for (const level of ["log", "warn", "error"]) {
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a))).join(" "));
  };
}
const out = (line) => process.stdout.write(line + "\n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const checkout = await import("../app/api/create-checkout-session/route.js");
const offerPreview = await import("../app/api/offer-preview/route.js");
const webhook = await import("../app/api/stripe-webhook/route.js");

let ipCounter = 0;
async function callCheckout(overrides = {}) {
  ipCounter += 1;
  const body = {
    tier: "tier2",
    companyName: "Offline Test Co",
    contactName: "Pat Tester",
    email: `pat+${ipCounter}@example.com`,
    phone: "(575) 555-0142",
    address: "",
    existingLinks: "https://example.com",
    signerName: "Pat Tester",
    agreementVersion: "service-agreement-v1",
    companyInformation: "Offline Test Co\nDiesel repair and towing.",
    domainPreferred: "offline-test-co.com",
    domainSecondChoice: "",
    domainThirdChoice: "",
    signedAgreement: "yes",
    websiteLanguages: "both",
    addOns: ["performance_reports"],
    _hp_ref: "",
    ...overrides,
  };
  for (const [k, v] of Object.entries(body)) if (v === undefined) delete body[k];
  const started = Date.now();
  const res = await Promise.race([
    checkout.POST(
      new Request("https://offline.test/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${ipCounter}` },
        body: JSON.stringify(body),
      })
    ),
    new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
  ]);
  if (!res) return { status: "TIMEOUT(15s)", body: {}, ms: Date.now() - started, email: body.email };
  return { status: res.status, body: await res.json(), ms: Date.now() - started, email: body.email };
}

function eventFor(session, type = "checkout.session.completed", extra = {}) {
  const paid = type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded";
  const { _params, subscription_metadata, payment_intent_metadata, ...publicSession } = session;
  return {
    id: `evt_test_${crypto.randomBytes(6).toString("hex")}`,
    object: "event",
    type,
    data: {
      object: {
        ...publicSession,
        status: paid ? "complete" : publicSession.status,
        payment_status: type === "checkout.session.async_payment_failed" ? "unpaid" : paid ? "paid" : publicSession.payment_status,
        payment_intent: session.mode === "payment" ? `pi_test_${session.id.slice(-4)}` : null,
        subscription: session.mode === "subscription" ? `sub_test_${session.id.slice(-4)}` : null,
        invoice: session.mode === "subscription" ? `in_test_${session.id.slice(-4)}` : null,
        customer_details: { email: session.metadata.email },
        ...extra,
      },
    },
  };
}

async function deliver(event) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${raw}`, "utf8").digest("hex");
  const res = await webhook.POST(
    new Request("https://offline.test/api/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${t},v1=${sig}` },
      body: raw,
    })
  );
  return { status: res.status, body: await res.json().catch(() => null) };
}

const counts = () => Object.fromEntries(Object.keys(COLUMNS).map((t) => [t, db[t].length]));
const sentEmails = () => db.email_events.filter((e) => e.status === "sent").length;
const invoiceSends = () => stripe.calls.filter((c) => /\/invoices\/.+\/send$/.test(c.path)).length;

const results = [];
let current = null;
function test(name) {
  current = { name, checks: [] };
  results.push(current);
  out(`\n${name}`);
}
function check(label, condition, detail = "") {
  current.checks.push({ label, pass: Boolean(condition) });
  out(`  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}
const logsSince = (n) => logs.slice(n).join("\n");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
resetDb();

test("TEST 1 — Agreement complete + Supabase healthy → behavior unchanged");
supa.mode = "up";
const t1 = await callCheckout();
const t1Session = stripe.sessions.get(t1.body.sessionId);
check("checkout returns 200 with Stripe URL", t1.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(t1.body.url || ""), `status=${t1.status}`);
check("1 customer saved as payment_pending", db.customers.length === 1 && db.customers[0].status === "payment_pending");
check("1 onboarding saved as payment_pending with agreement_accepted=true", db.onboarding_submissions.length === 1 && db.onboarding_submissions[0].agreement_accepted === true && db.onboarding_submissions[0].status === "payment_pending");
check("pending payment row saved for the session", db.payments.length === 1 && db.payments[0].stripe_checkout_session_id === t1.body.sessionId && db.payments[0].status === "pending");
check("session metadata carries Supabase customer + onboarding IDs", t1Session && t1Session.metadata.supabase_customer_id === db.customers[0].id && t1Session.metadata.supabase_onboarding_id === db.onboarding_submissions[0].id);
check("amount unchanged: $225 plan + $20 reports + $200 launch fee", t1Session && t1Session.amount_total === 22500 + 2000 + 20000, `amount_total=${t1Session && t1Session.amount_total}`);
check("subscription mode with month interval on recurring lines", t1Session && t1Session.mode === "subscription" && t1Session._params["line_items[0][price_data][recurring][interval]"] === "month" && t1Session._params["line_items[1][price_data][recurring][interval]"] === "month");
check("subscription_data metadata mirrors session metadata", t1Session && t1Session.subscription_metadata.tier === "tier2");
await new Promise((r) => setTimeout(r, 50));
check("pre-payment emails sent (internal + customer)", emails.filter((e) => /PAYMENT PENDING|AUTO-REPLY/.test(e.subject)).length === 2, `emails=${emails.length}`);

test("TEST 2 — Agreement complete + Supabase unavailable before checkout → Stripe Checkout still created");
for (const mode of ["down", "http503", "hang"]) {
  resetDb();
  supa.mode = mode;
  const before = logs.length;
  const r = await callCheckout();
  const s = stripe.sessions.get(r.body.sessionId);
  check(`[${mode}] checkout returns 200 with Stripe URL`, r.status === 200 && Boolean(r.body.url), `status=${r.status} ${r.status !== 200 ? JSON.stringify(r.body) : ""} ${r.ms}ms`);
  check(`[${mode}] session has reconciliation metadata (onboarding_ref, tier, add-ons, agreement)`, s && s.metadata.onboarding_ref && s.metadata.tier === "tier2" && s.metadata.addons === "performance_reports" && s.metadata.signed_agreement === "yes" && s.metadata.agreement_version === "service-agreement-v1" && s.metadata.agreement_signed_at);
  check(`[${mode}] session marks Supabase persistence as not saved`, s && s.metadata.supabase_persisted === "no" && !s.metadata.supabase_customer_id);
  check(`[${mode}] same amount as healthy path`, s && s.amount_total === 44500);
  check(`[${mode}] persistence failure logged with [payment-persistence] tag`, /\[payment-persistence\]/.test(logsSince(before)));
  if (mode === "hang") check("[hang] Supabase timeout bounded (< 10s)", r.ms < 10000, `${r.ms}ms`);
}
supa.mode = "up";

test("TEST 3 — Agreement NOT complete + Supabase unavailable → payment blocked");
for (const mode of ["down", "up"]) {
  supa.mode = mode;
  const stripeBefore = stripe.calls.length;
  const no = await callCheckout({ signedAgreement: "no" });
  const missing = await callCheckout({ signedAgreement: undefined });
  const badVersion = await callCheckout({ agreementVersion: "service-agreement-v0" });
  const noSigner = await callCheckout({ signerName: "" });
  check(`[supabase ${mode}] signedAgreement="no" rejected`, no.status === 400, `status=${no.status}`);
  check(`[supabase ${mode}] signedAgreement missing rejected`, missing.status === 400, `status=${missing.status}`);
  check(`[supabase ${mode}] unknown agreement version rejected`, badVersion.status === 400, `status=${badVersion.status}`);
  check(`[supabase ${mode}] missing signer rejected`, noSigner.status === 400, `status=${noSigner.status}`);
  check(`[supabase ${mode}] no Stripe customer/session created`, stripe.calls.length === stripeBefore, `stripe calls=${stripe.calls.length - stripeBefore}`);
}
supa.mode = "up";

test("TEST 4 — Successful Stripe payment + Supabase healthy → webhook works normally");
resetDb();
emails.length = 0;
const t4 = await callCheckout();
await new Promise((r) => setTimeout(r, 50));
const t4Session = stripe.sessions.get(t4.body.sessionId);
const t4Event = eventFor(t4Session);
const t4Res = await deliver(t4Event);
check("webhook acknowledged 200", t4Res.status === 200, `status=${t4Res.status}`);
check("payment marked paid with paid_at", db.payments.length === 1 && db.payments[0].status === "paid" && db.payments[0].paid_at);
check("customer activated", db.customers[0].status === "active");
check("onboarding moved to in_progress", db.onboarding_submissions[0].status === "in_progress");
check("1 website project created", db.website_projects.length === 1);
check("payment-received emails sent and recorded", emails.some((e) => /PAYMENT RECEIVED/.test(e.subject)) && db.email_events.some((e) => e.event_key === `payment_success:${t4Session.id}` && e.status === "sent"));
check("Stripe invoice sent once", invoiceSends() === 1);

test("TEST 5 — Successful Stripe payment + Supabase webhook write failure → recoverable, Stripe retries");
resetDb();
emails.length = 0;
supa.mode = "down";
const t5 = await callCheckout();
const t5Session = stripe.sessions.get(t5.body.sessionId);
const t5Event = eventFor(t5Session);
const stripeCallsBefore = stripe.calls.length;
const logBefore5 = logs.length;
const t5Res = await deliver(t5Event);
const t5Logs = logsSince(logBefore5);
check("webhook returns 500 so Stripe retries the event", t5Res.status === 500, `status=${t5Res.status}`);
check("no Stripe refund/cancel/charge calls made", stripe.calls.length === stripeCallsBefore);
check("no payment-received email sent while unrecorded", !emails.some((e) => /PAYMENT RECEIVED/.test(e.subject)));
check("log tagged [payment-persistence] with event, session, subscription IDs", /\[payment-persistence\]/.test(t5Logs) && t5Logs.includes(t5Event.id) && t5Logs.includes(t5Session.id) && t5Logs.includes(t5Event.data.object.subscription), "");
check("log names the failed Supabase operation and onboarding_ref", /GET payments|operation/.test(t5Logs) && t5Logs.includes(t5Session.metadata.onboarding_ref || "<none>"));
check("log contains no secrets", !/sk_test_offline|offline-service-role|whsec_offline/.test(t5Logs));

// Partial failure: Supabase healthy except website_projects insert.
supa.mode = "up";
const t5b = await callCheckout();
const t5bSession = stripe.sessions.get(t5b.body.sessionId);
const t5bEvent = eventFor(t5bSession);
supa.failWhen = (method, table) => method === "POST" && table === "website_projects";
const t5bRes = await deliver(t5bEvent);
supa.failWhen = null;
check("partial failure (project insert) → 500 for retry", t5bRes.status === 500, `status=${t5bRes.status}`);

test("TEST 6 — Supabase recovers + Stripe retry → records reconcile, no duplicates");
supa.mode = "up";
const before6 = counts();
const t6Res = await deliver(t5Event);
const reconciledOnboarding = db.onboarding_submissions.find((o) => o.payload && o.payload.onboarding_ref === t5Session.metadata.onboarding_ref);
const reconciledCustomer = reconciledOnboarding && db.customers.find((c) => c.id === reconciledOnboarding.customer_id);
const t5Payment = db.payments.find((p) => p.stripe_checkout_session_id === t5Session.id);
check("retry acknowledged 200", t6Res.status === 200, `status=${t6Res.status}`);
check("onboarding record rebuilt from Stripe metadata", reconciledOnboarding && reconciledOnboarding.tier === "tier2" && reconciledOnboarding.agreement_accepted === true && reconciledOnboarding.status === "in_progress" && reconciledOnboarding.domain_preferred === "offline-test-co.com");
check("customer record created and active", reconciledCustomer && reconciledCustomer.status === "active" && reconciledCustomer.email === t5.email);
check("payment row paid and linked to customer", t5Payment && t5Payment.status === "paid" && reconciledCustomer && t5Payment.customer_id === reconciledCustomer.id);
check("website project created", reconciledCustomer && db.website_projects.filter((p) => p.customer_id === reconciledCustomer.id).length === 1);
check("payment-received emails sent once", db.email_events.filter((e) => e.event_key === `payment_success:${t5Session.id}`).length === 1);
const t6bRes = await deliver(t5bEvent);
const t5bCustomer = t5bSession.metadata.supabase_customer_id;
check("partial-failure retry acknowledged 200", t6bRes.status === 200);
check("partial-failure retry: exactly 1 payment + 1 project", db.payments.filter((p) => p.stripe_checkout_session_id === t5bSession.id).length === 1 && db.website_projects.filter((p) => p.customer_id === t5bCustomer).length === 1);
const after6 = counts();
check("only expected new rows (1 customer, 1 onboarding, 1 payment, 2 projects)", after6.customers - before6.customers === 1 && after6.onboarding_submissions - before6.onboarding_submissions === 1 && after6.payments - before6.payments === 1 && after6.website_projects - before6.website_projects === 2, JSON.stringify({ before6, after6 }));

test("TEST 7 — Repeated delivery of the same event → idempotent");
const snap = counts();
const sentBefore = sentEmails();
const emailsBefore = emails.length;
const invoicesBefore = invoiceSends();
const paidAtBefore = t5Payment && t5Payment.paid_at;
const statuses = [];
for (let i = 0; i < 3; i += 1) {
  statuses.push((await deliver(t5Event)).status, (await deliver(t5bEvent)).status);
}
check("all redeliveries acknowledged 200", statuses.every((s) => s === 200), statuses.join(","));
check("no new rows in any table", JSON.stringify(counts()) === JSON.stringify(snap), JSON.stringify(counts()));
check("no duplicate emails sent", emails.length === emailsBefore && sentEmails() === sentBefore, `emails +${emails.length - emailsBefore}`);
check("no duplicate Stripe invoice sends", invoiceSends() === invoicesBefore, `+${invoiceSends() - invoicesBefore}`);
check("paid_at not rewritten on redelivery", db.payments.find((p) => p.id === t5Payment.id).paid_at === paidAtBefore);

supa.mode = "down";
const t7 = await callCheckout({ email: "concurrent@example.com" });
const t7Event = eventFor(stripe.sessions.get(t7.body.sessionId));
supa.mode = "up";
const snap7 = counts();
const concurrent = await Promise.all([deliver(t7Event), deliver(t7Event), deliver(t7Event)]);
const retry7 = concurrent.some((r) => r.status !== 200) ? await deliver(t7Event) : null;
const ref7 = stripe.sessions.get(t7.body.sessionId).metadata.onboarding_ref;
check("concurrent deliveries settle (200, or 500 then 200 on retry)", concurrent.some((r) => r.status === 200) || (retry7 && retry7.status === 200), concurrent.map((r) => r.status).join(",") + (retry7 ? ` retry=${retry7.status}` : ""));
check("concurrent deliveries → exactly 1 onboarding for the ref", db.onboarding_submissions.filter((o) => o.payload && o.payload.onboarding_ref === ref7).length === 1);
check("concurrent deliveries → exactly 1 customer + 1 payment + 1 project", (() => { const c = counts(); return c.customers - snap7.customers === 1 && c.payments - snap7.payments === 1 && c.website_projects - snap7.website_projects === 1; })(), JSON.stringify(counts()));

const concurrentWelcome = emails.filter((e) => /PAYMENT RECEIVED/.test(e.subject) && e.subject.includes("Offline Test Co")).length;
out(`  INFO  payment-received internal emails across the whole run (incl. 3 simultaneous deliveries): ${concurrentWelcome}`);

supa.migration009 = false;
supa.mode = "down";
const t7n = await callCheckout({ email: "no-migration@example.com" });
const t7nEvent = eventFor(stripe.sessions.get(t7n.body.sessionId));
supa.mode = "up";
const snap7n = counts();
const t7nRes = await Promise.all([deliver(t7nEvent), deliver(t7nEvent), deliver(t7nEvent)]);
const t7nRetry = t7nRes.some((r) => r.status !== 200) ? await deliver(t7nEvent) : null;
const ref7n = stripe.sessions.get(t7n.body.sessionId).metadata.onboarding_ref;
const c7n = counts();
check(
  "without migration 009: 3 simultaneous deliveries → 1 onboarding, 1 customer, 1 payment, 1 project",
  db.onboarding_submissions.filter((o) => o.payload && o.payload.onboarding_ref === ref7n).length === 1 &&
    c7n.customers - snap7n.customers === 1 && c7n.payments - snap7n.payments === 1 && c7n.website_projects - snap7n.website_projects === 1,
  `statuses ${t7nRes.map((r) => r.status).join(",")}${t7nRetry ? ` retry=${t7nRetry.status}` : ""} ${JSON.stringify(c7n)}`
);
supa.migration009 = true;

const renewal = {
  id: "evt_test_invoice_renewal",
  type: "invoice.paid",
  data: { object: { id: "in_test_renewal_1", object: "invoice", billing_reason: "subscription_cycle", customer: t4Session.customer, amount_paid: 24500, amount_due: 24500, currency: "usd" } },
};
const before7i = db.payments.length;
const rs = [await deliver(renewal), await deliver(renewal), await deliver(renewal)];
check("renewal invoice.paid redelivered 3x → 1 payment row", rs.every((r) => r.status === 200) && db.payments.length - before7i === 1, `+${db.payments.length - before7i}`);

test("TEST 8 — Genuine Stripe failures keep current behavior");
supa.mode = "up";
stripe.failCheckout = true;
const t8 = await callCheckout();
stripe.failCheckout = false;
check("Stripe session error → 503 with safe customer message", t8.status === 503 && /Payment setup is temporarily unavailable/.test(t8.body.error || ""), `status=${t8.status}`);
supa.mode = "down";
stripe.failCheckout = true;
const t8b = await callCheckout();
stripe.failCheckout = false;
check("Stripe error during Supabase outage → same 503 (not masked)", t8b.status === 503 && /Payment setup is temporarily unavailable/.test(t8b.body.error || ""), `status=${t8b.status}`);
supa.mode = "up";
const t8c = await callCheckout({ email: "async-fail@example.com" });
const t8cSession = stripe.sessions.get(t8c.body.sessionId);
await new Promise((r) => setTimeout(r, 50));
const paymentEmails = () => emails.filter((e) => /PAYMENT RECEIVED|payment_welcome/i.test(e.subject + e.requestType)).length;
const emailsBefore8 = paymentEmails();
const failRes = await deliver(eventFor(t8cSession, "checkout.session.async_payment_failed"));
const failPayment = db.payments.find((p) => p.stripe_checkout_session_id === t8cSession.id);
check("async_payment_failed → payment failed, customer stays payment_pending", failRes.status === 200 && failPayment && failPayment.status === "failed" && db.customers.find((c) => c.id === t8cSession.metadata.supabase_customer_id).status === "payment_pending");
check("no payment-received email for a failed payment", paymentEmails() === emailsBefore8);
const expRes = await deliver(eventFor(t8cSession, "checkout.session.expired"));
check("checkout.session.expired → payment canceled", expRes.status === 200 && db.payments.find((p) => p.stripe_checkout_session_id === t8cSession.id).status === "canceled");

test("SECURITY — webhook signature still enforced");
const forged = await webhook.POST(new Request("https://offline.test/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef" }, body: JSON.stringify(t4Event) }));
check("forged signature rejected with 400", forged.status === 400);

async function previewTotals(body) {
  const res = await offerPreview.POST(
    new Request("https://offline.test/api/offer-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.9.0.8" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
}

function useOfferEnv() {
  process.env.STRIPE_PRICE_TIER1 = "price_test_tier1";
  process.env.STRIPE_PRICE_TIER2 = "price_test_tier2";
  process.env.STRIPE_PRICE_TIER3 = "price_test_tier3";
  process.env.STRIPE_COUPON_FIRST_MONTH_10 = "coupon_test_10";
  process.env.STRIPE_COUPON_FIRST_MONTH_20 = "coupon_test_20";
  process.env.STRIPE_COUPON_FIRST_MONTH_30 = "coupon_test_30";
}

function clearOfferEnv() {
  delete process.env.STRIPE_PRICE_TIER1;
  delete process.env.STRIPE_PRICE_TIER2;
  delete process.env.STRIPE_PRICE_TIER3;
  delete process.env.STRIPE_COUPON_FIRST_MONTH_10;
  delete process.env.STRIPE_COUPON_FIRST_MONTH_20;
  delete process.env.STRIPE_COUPON_FIRST_MONTH_30;
  stripe.subscriptionsByEmail = {};
}

test("TEST 9 — Recurring discounts apply only to a new subscription plan");
resetDb();
supa.mode = "up";
stripe.failCheckout = false;
useOfferEnv();
const qualified = {
  businessAddress: "100 Main St, Carlsbad, NM 88220",
  addressAttested: "yes",
  serviceBranch: "U.S. Air Force",
};
function sequentialRate(cents, local, responder) {
  let amount = cents;
  if (local) amount = Math.round((amount * 90) / 100);
  if (responder) amount = Math.round((amount * 80) / 100);
  return amount;
}
const cases = [
  { name: "10%", offer: "local", tier: "tier1", addOns: [], local: true, responder: false, tierCents: 9900, addonCents: 0 },
  { name: "20%", offer: "service", tier: "tier2", addOns: ["performance_reports"], local: false, responder: true, tierCents: 22500, addonCents: 2000 },
  { name: "10% then 20%", offer: "both", tier: "tier3", addOns: ["admin_dashboard"], local: true, responder: true, tierCents: 39900, addonCents: 5000 },
];
for (const sample of cases) {
  const fields = {
    ...qualified,
    offer: sample.offer,
    tier: sample.tier,
    addOns: sample.addOns,
    serviceBranch: sample.offer === "local" ? "" : qualified.serviceBranch,
    businessAddress: sample.offer === "service" ? "" : qualified.businessAddress,
    addressAttested: sample.offer === "service" ? "no" : "yes",
  };
  const shown = await previewTotals(fields);
  const paid = await callCheckout({ ...fields, percent: 90, coupon: "coupon_attacker", amount: 100, price: 1 });
  const session = stripe.sessions.get(paid.body.sessionId);
  const plan = sequentialRate(sample.tierCents, sample.local, sample.responder);
  const due = plan + sample.addonCents + 20000;
  const renewal = plan + sample.addonCents;
  const launchIndex = sample.addonCents > 0 ? 2 : 1;
  check(`${sample.name} preview matches Stripe checkout`, shown.status === 200 && shown.body.dueTodayCents === due && session && session.amount_total === due, `preview=${shown.body.dueTodayCents} stripe=${session && session.amount_total} expected=${due}`);
  check(`${sample.name} renews at the discounted price without a coupon`, session && !session._params["discounts[0][coupon]"] && session._params["discounts[0][coupon]"] !== "coupon_attacker" && !session._params["line_items[0][price]"] && lineAmount(session._params, 0) === plan && session._params["line_items[0][price_data][recurring][interval]"] === "month");
  check(`${sample.name} launch fee stays $200 and the monthly rate continues`, session && lineAmount(session._params, launchIndex) === 20000 && shown.body.renewalCents === renewal && shown.body.launchFeeCents === 20000);
}
const missing = await callCheckout({ offer: "both", businessAddress: "", addressAttested: "no", serviceBranch: " ", percent: 30, coupon: "coupon_test_30" });
const missingSession = stripe.sessions.get(missing.body.sessionId);
check("missing eligibility details leave the full price and no coupon", missing.status === 200 && missingSession && missingSession.amount_total === 22500 + 2000 + 20000 && !missingSession._params["discounts[0][coupon]"], `amount=${missingSession && missingSession.amount_total}`);
const partial = await callCheckout({ offer: "both", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "", percent: 30 });
const partialSession = stripe.sessions.get(partial.body.sessionId);
check("an incomplete combined offer applies only the eligible 10%", partial.status === 200 && partialSession && !partialSession._params["discounts[0][coupon]"] && partialSession.amount_total === 20250 + 2000 + 20000 && lineAmount(partialSession._params, 0) === 20250);
const sessionsBeforeReject = stripe.calls.filter((call) => call.path === "/v1/checkout/sessions").length;
db.customers.push({ id: "cus_active_existing", company_name: "Existing Co", email: "existing-sub@example.com", status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
const rejected = await callCheckout({ email: "existing-sub@example.com", offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "" });
const sessionsAfterReject = stripe.calls.filter((call) => call.path === "/v1/checkout/sessions").length;
check("an existing subscriber is rejected before checkout", rejected.status === 400 && /current or former subscription/i.test(rejected.body.error || "") && sessionsAfterReject === sessionsBeforeReject);
db.customers.push({ id: "cus_churned_existing", company_name: "Former Co", email: "churned-sub@example.com", status: "churned", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
const churned = await callCheckout({ email: "churned-sub@example.com", offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "" });
check("a former local subscriber is rejected before checkout", churned.status === 400 && /current or former subscription/i.test(churned.body.error || "") && stripe.calls.filter((call) => call.path === "/v1/checkout/sessions").length === sessionsAfterReject);
stripe.subscriptionsByEmail["stripe-sub@example.com"] = { customerId: "cus_stripe_existing", status: "active" };
const stripeRejected = await callCheckout({ email: "stripe-sub@example.com", offer: "service", businessAddress: "", addressAttested: "no", serviceBranch: "Carlsbad Fire Department" });
check("Stripe subscription history rejects the offer", stripeRejected.status === 400 && /current or former subscription/i.test(stripeRejected.body.error || ""));
stripe.subscriptionsByEmail["canceled-sub@example.com"] = { customerId: "cus_stripe_canceled", status: "canceled" };
const sessionsBeforeCanceled = stripe.calls.filter((call) => call.path === "/v1/checkout/sessions").length;
const canceledRejected = await callCheckout({ email: "canceled-sub@example.com", tier: "tier1", addOns: [], offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes" });
check("a canceled Stripe subscription cannot claim the new-subscription offer", canceledRejected.status === 400 && /current or former subscription/i.test(canceledRejected.body.error || "") && stripe.calls.filter((call) => call.path === "/v1/checkout/sessions").length === sessionsBeforeCanceled);
stripe.subscriptionsByEmail["expired-sub@example.com"] = { customerId: "cus_stripe_expired", status: "incomplete_expired" };
const expiredRejected = await callCheckout({ email: "expired-sub@example.com", tier: "tier1", addOns: [], offer: "service", businessAddress: "", addressAttested: "no", serviceBranch: "Carlsbad Fire Department" });
check("an expired incomplete subscription cannot claim the offer", expiredRejected.status === 400 && /current or former subscription/i.test(expiredRejected.body.error || ""));
db.customers.push({ id: "cus_abandoned", company_name: "Abandoned Co", email: "abandoned@example.com", status: "payment_pending", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
db.payments.push({ id: "pay_abandoned", customer_id: "cus_abandoned", status: "canceled", payment_type: "subscription", amount_cents: 42500, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
stripe.subscriptionsByEmail["abandoned@example.com"] = { customerId: "cus_stripe_abandoned", status: "" };
const abandoned = await callCheckout({ email: "abandoned@example.com", tier: "tier1", addOns: [], offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes" });
const abandonedSession = stripe.sessions.get(abandoned.body.sessionId);
check("an abandoned checkout with no subscription can use the offer", abandoned.status === 200 && abandonedSession && abandonedSession.amount_total === 8910 + 20000 && !abandonedSession._params["discounts[0][coupon]"] && lineAmount(abandonedSession._params, 0) === 8910);
const stripeWrites = () => stripe.calls.filter((call) => call.method === "POST" && (call.path === "/v1/customers" || call.path === "/v1/checkout/sessions")).length;
const writesBeforeTruncated = stripeWrites();
stripe.truncateEmail = "truncated-history@example.com";
const truncated = await callCheckout({ email: "truncated-history@example.com", tier: "tier1", addOns: [], offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "" });
stripe.truncateEmail = "";
check("unreadable subscription history stops checkout without charging", truncated.status === 503 && /could not be confirmed/i.test(truncated.body.error || "") && stripeWrites() === writesBeforeTruncated);
delete process.env.STRIPE_COUPON_FIRST_MONTH_20;
delete process.env.STRIPE_PRICE_TIER1;
const missingCatalog = await callCheckout({ tier: "tier1", addOns: [], offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "" });
const missingCatalogSession = stripe.sessions.get(missingCatalog.body.sessionId);
check("a discounted checkout works without a catalog price or coupon", missingCatalog.status === 200 && missingCatalogSession && missingCatalogSession.amount_total === 8910 + 20000 && lineAmount(missingCatalogSession._params, 0) === 8910 && !missingCatalogSession._params["discounts[0][coupon]"]);
process.env.STRIPE_PRICE_TIER1 = "price_test_tier1";
process.env.STRIPE_COUPON_FIRST_MONTH_10 = "coupon_test_broad";
const unsafe = await callCheckout({ tier: "tier2", addOns: [], offer: "local", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes" });
const unsafeSession = stripe.sessions.get(unsafe.body.sessionId);
check("an old coupon is not applied to the discounted monthly price", unsafe.status === 200 && unsafeSession && !unsafeSession._params["discounts[0][coupon]"] && lineAmount(unsafeSession._params, 0) === 20250 && unsafeSession.amount_total === 20250 + 20000);
const tier2Included = await callCheckout({ tier: "tier2", addOns: ["admin_dashboard", "performance_reports"] });
const tier2IncludedSession = stripe.sessions.get(tier2Included.body.sessionId);
check("Tier 2 checkout includes the dashboard and does not add $50", tier2Included.status === 200 && tier2IncludedSession && tier2IncludedSession.amount_total === 22500 + 2000 + 20000 && tier2IncludedSession.metadata.admin_dashboard_requested === "yes" && lineAmount(tier2IncludedSession._params, 0) === 22500 && lineAmount(tier2IncludedSession._params, 1) === 2000);
const tier2DashboardOnly = await callCheckout({ tier: "tier2", addOns: ["admin_dashboard"] });
const tier2DashboardOnlySession = stripe.sessions.get(tier2DashboardOnly.body.sessionId);
check("Tier 2 with only the dashboard add-on requested stays $225 plus setup", tier2DashboardOnly.status === 200 && tier2DashboardOnlySession && tier2DashboardOnlySession.amount_total === 22500 + 20000 && tier2DashboardOnlySession.metadata.tier === "tier2" && tier2DashboardOnlySession._params.cancel_url.includes("tier=tier2"));
const tier1Dashboard = await callCheckout({ tier: "tier1", addOns: ["admin_dashboard"] });
const tier1DashboardSession = stripe.sessions.get(tier1Dashboard.body.sessionId);
check("Tier 1 still charges the optional $50 dashboard", tier1Dashboard.status === 200 && tier1DashboardSession && tier1DashboardSession.amount_total === 9900 + 5000 + 20000 && tier1DashboardSession.metadata.admin_dashboard_requested === "yes");
clearOfferEnv();
const buyout = await callCheckout({ tier: "buyout-tier2", addOns: [], offer: "both", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "U.S. Air Force", percent: 30 });
const buyoutSession = stripe.sessions.get(buyout.body.sessionId);
check("buy-out keeps the full prepaid price and the $200 launch fee", buyout.status === 200 && buyoutSession && buyoutSession.amount_total === 22500 * 24 + 20000 && buyoutSession.metadata.admin_dashboard_requested === "yes" && !buyoutSession._params["discounts[0][coupon]"]);

const pricing = await import("../lib/pricing/first-month-offer.js");
const tier4Preview = pricing.checkoutTotals({ tierCents: 4400, local: true, responder: true, mode: "subscription" });
check("Tier 4 with both discounts is $31.68, not a flat 30% off", tier4Preview.discountedTier === 3168 && tier4Preview.dueToday === 23168 && tier4Preview.renewal === 3168 && tier4Preview.launchFeeCents === 20000);
const tier4BuyoutMath = pricing.checkoutTotals({ tierCents: 4400 * 24, local: true, responder: true, mode: "payment" });
check("Tier 4 upfront buyout stays $1,256 with no discount", tier4BuyoutMath.dueToday === 4400 * 24 + 20000 && tier4BuyoutMath.discountPercent === 0);

const tier4 = await callCheckout({ tier: "tier4", addOns: ["admin_dashboard", "performance_reports"], offer: "" });
const tier4Session = stripe.sessions.get(tier4.body.sessionId);
check("Tier 4 monthly checkout is $44 + reports + $200, without the dashboard", tier4.status === 200 && tier4Session && tier4Session.amount_total === 4400 + 2000 + 20000 && tier4Session.metadata.tier === "tier4" && tier4Session.metadata.website_languages === "en-es" && tier4Session.metadata.admin_dashboard_requested === "no");
const tier4Buyout = await callCheckout({ tier: "buyout-tier4", addOns: ["admin_dashboard"], offer: "both", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "U.S. Air Force" });
const tier4BuyoutSession = stripe.sessions.get(tier4Buyout.body.sessionId);
check("Tier 4 buyout checkout is $1,056 + $200 and ignores the first-month offer", tier4Buyout.status === 200 && tier4BuyoutSession && tier4BuyoutSession.amount_total === 105600 + 20000 && tier4BuyoutSession.mode === "payment" && !tier4BuyoutSession._params["discounts[0][coupon]"]);
const tier4Language = await callCheckout({ tier: "tier4", addOns: [], websiteLanguages: "" });
check("Tier 4 checkout requires a language choice", tier4Language.status === 400 && /English and Spanish/i.test(tier4Language.body.error || ""));
const tier4OneLanguage = await callCheckout({ tier: "tier4", addOns: [], websiteLanguages: "one", websiteLanguage: "es" });
const tier4OneSession = stripe.sessions.get(tier4OneLanguage.body.sessionId);
check("A single-language choice is stored as Spanish", tier4OneLanguage.status === 200 && tier4OneSession && tier4OneSession.metadata.website_languages === "es");
const tier4Offer = await callCheckout({ tier: "tier4", addOns: [], offer: "both", businessAddress: "100 Main St, Carlsbad, NM 88220", addressAttested: "yes", serviceBranch: "U.S. Air Force" });
const tier4OfferSession = stripe.sessions.get(tier4Offer.body.sessionId);
check("Tier 4 discounted checkout is $31.68 plus the $200 setup fee", tier4Offer.status === 200 && tier4OfferSession && tier4OfferSession.amount_total === 3168 + 20000 && lineAmount(tier4OfferSession._params, 0) === 3168 && lineAmount(tier4OfferSession._params, 1) === 20000 && tier4OfferSession._params["line_items[0][price_data][recurring][interval]"] === "month" && tier4OfferSession.metadata.tier === "tier4" && tier4OfferSession.metadata.admin_dashboard_requested === "no" && tier4OfferSession._params.cancel_url.includes("tier=tier4") && !tier4OfferSession._params["discounts[0][coupon]"]);
const consultation = await import("../lib/consultations/validate.js");
const flyerConsult = consultation.validateConsultation({
  businessName: "Flyer Co",
  contactName: "Ada",
  email: "ada@example.com",
  description: "Food truck flyer",
  contactMethod: "email",
  tier: "tier4",
});
check("Tier 4 consultation keeps the database tier column within the existing allowed values", flyerConsult.ok && flyerConsult.value.preferred_tier === null && flyerConsult.value.payload.preferred_package === "tier4");

// ---------------------------------------------------------------------------
const all = results.flatMap((r) => r.checks);
const failed = all.filter((c) => !c.pass);
out(`\n${all.length - failed.length}/${all.length} checks passed`);
if (process.env.SHOW_LOGS) out("\n--- captured logs ---\n" + logs.join("\n"));
process.exit(failed.length ? 1 : 0);
