#!/usr/bin/env node
/** Run: node --env-file=.env.local scripts/verify-supabase-schema.mjs */
const BASE = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const REQUIRED = [
  { table: "customers", probe: "select=id&limit=1" },
  { table: "onboarding_submissions", probe: "select=id&limit=1" },
  { table: "payments", probe: "select=id&limit=1" },
  { table: "quote_requests", probe: "select=id&limit=1" },
  { table: "email_events", probe: "select=id&limit=1" },
  { table: "admin_users", probe: "select=user_id&limit=1" },
];

const COLUMN_CHECKS = [
  {
    table: "onboarding_submissions",
    row: {
      tier: "tier1",
      company_name: "__schema_probe__",
      contact_name: "Probe",
      email: "schema-probe@invalid.local",
      agreement_accepted: false,
      status: "received",
      payload: {},
      domain_preferred: "probe.example.com",
    },
    expectColumn: "domain_preferred",
  },
  {
    table: "quote_requests",
    row: {
      contact_name: "Probe",
      email: "schema-probe@invalid.local",
      service: "Probe",
      message: "probe",
      status: "new",
      payment_status: "none",
      payload: {},
    },
    expectColumn: null,
  },
];

async function rest(path, opts = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  if (!BASE || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  console.log("Supabase schema verification\nHost:", new URL(BASE).host, "\n");

  for (const { table, probe } of REQUIRED) {
    const { status, text } = await rest(`${table}?${probe}`);
    const ok = status === 200;
    console.log(`${ok ? "OK  " : "MISS"} ${table} (${status})`);
    if (!ok) console.log("     ", text.slice(0, 120));
  }

  console.log("\nColumn / constraint probes:");
  for (const check of COLUMN_CHECKS) {
    const { status, text } = await rest(check.table, {
      method: "POST",
      body: JSON.stringify(check.row),
    });
    if (status === 201) {
      console.log(`OK   ${check.table} insert probe`);
      const parsed = JSON.parse(text);
      const id = parsed[0]?.id;
      if (id) {
        await rest(`${check.table}?id=eq.${id}`, { method: "DELETE" });
      }
    } else if (check.expectColumn && /Could not find the .* column/i.test(text)) {
      console.log(`MISS ${check.table}.${check.expectColumn} — run migration 008_onboarding_domains.sql`);
    } else if (status === 404) {
      console.log(`MISS ${check.table} table — run migrations 004+`);
    } else if (/23514|check constraint/i.test(text)) {
      console.log(`WARN ${check.table} constraint — run migration 004_workflow_quotes_statuses.sql`);
      console.log("    ", text.slice(0, 150));
    } else {
      console.log(`FAIL ${check.table} (${status})`, text.slice(0, 150));
    }
  }

  console.log("\nEnv:");
  console.log("  STRIPE_WEBHOOK_SECRET:", process.env.STRIPE_WEBHOOK_SECRET ? "set" : "MISSING");
  console.log("  STATIC_FORMS_API_KEY:", process.env.STATIC_FORMS_API_KEY ? "set" : "default/hardcoded");
}

main();
