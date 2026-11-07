import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  OUTREACH_SCHEDULER_ACTIVE,
  PAGE_SIZE,
  PHASE_RULES,
  QUERY_BUDGET_PER_VIEW,
  WEEKDAY_TARGET,
  countProspects,
  filterProspects,
  findDuplicate,
  findSuppression,
  listWindow,
  nextScheduledRun,
  parseWebsite,
  retentionPlan,
  retryBudget,
  sanitizeSearch,
  shouldPollProspects,
  shouldSubscribeToProspects,
  sortProspects,
  sumRecentWrites,
  validateManualProspect,
  validateOutreachSettings,
  validateResearch,
  validateStatusChange,
} from "../lib/prospects/model.mjs";
import { outreachMailer } from "../lib/prospects/mailer.mjs";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

await check("manual add requires a business name and does not invent contact details", () => {
  const missing = validateManualProspect({ businessName: " ", city: "", website: "", email: "", notes: "" });
  assert.equal(missing.ok, false);
  const saved = validateManualProspect({
    businessName: "  Mesa  Welding  ",
    city: "Carlsbad",
    website: "",
    email: "",
    notes: "Asked to be first",
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.businessName, "Mesa Welding");
  assert.equal(saved.value.email, "");
  assert.equal(saved.value.websiteUrl, "");
  assert.equal(saved.value.status, "queued");
  assert.equal(saved.value.manualPriority, true);
  assert.equal(saved.value.outreachEligible, false);
});

await check("rejects a bad email or website without blocking a blank one", () => {
  assert.equal(validateManualProspect({ businessName: "Acme", email: "not-an-email" }).ok, false);
  assert.equal(validateManualProspect({ businessName: "Acme", website: "javascript:alert(1)" }).ok, false);
  assert.equal(validateManualProspect({ businessName: "Acme" }).ok, true);
  assert.deepEqual(parseWebsite("https://www.Example.com/about"), {
    url: "https://www.example.com/about",
    host: "example.com",
  });
});

await check("duplicate name, website, or email is blocked", () => {
  const existing = [
    { business_name: "Acme Auto", city: "Artesia", public_email: "hello@acme.test", website_host: "acme.test" },
  ];
  assert.ok(findDuplicate(existing, { businessName: "acme auto", city: "Artesia" }));
  assert.equal(findDuplicate(existing, { businessName: "Acme Auto", city: "Carlsbad" }), null);
  assert.ok(findDuplicate(existing, { businessName: "Other", email: "Hello@Acme.test" }));
  assert.ok(findDuplicate(existing, { businessName: "Other", website: "www.acme.test" }));
});

await check("opted-out businesses stay suppressed", () => {
  const blocked = findSuppression(
    [{ business_name: "Old Shop", city: "Loving", email: "old@shop.test", website_host: "oldshop.test", reason: "do_not_contact" }],
    { businessName: "New Name", email: "old@shop.test" }
  );
  assert.ok(blocked);
  assert.equal(findSuppression([], { businessName: "New Shop", city: "Hope" }), null);
});

await check("dashboard counts and filters follow the status groups", () => {
  const rows = [
    { status: "queued", business_name: "A", city: "Carlsbad", public_email: "", notes: "", sent_at: null },
    { status: "researching", business_name: "B", city: "Artesia", public_email: "", notes: "needs hours", sent_at: null },
    { status: "ready", business_name: "C", city: "Hope", public_email: "c@test.com", notes: "", sent_at: null },
    { status: "sent", business_name: "D", city: "Loving", public_email: "", notes: "", sent_at: "2026-11-02T16:00:00Z" },
    { status: "interested", business_name: "E", city: "Carlsbad", public_email: "", notes: "", sent_at: "2026-11-03T16:00:00Z" },
    { status: "not_interested", business_name: "F", city: "Artesia", public_email: "", notes: "", sent_at: "2026-11-04T16:00:00Z" },
    { status: "do_not_contact", business_name: "G", city: "Hope", public_email: "", notes: "", sent_at: null },
    { status: "bounced", business_name: "H", city: "Loving", public_email: "", notes: "", sent_at: "2026-11-05T16:00:00Z" },
    { status: "failed", business_name: "I", city: "Carlsbad", public_email: "", notes: "", sent_at: null },
  ];
  const counts = countProspects(rows);
  assert.equal(counts.total, 9);
  assert.equal(counts.awaitingResearch, 2);
  assert.equal(counts.ready, 1);
  assert.equal(counts.emailsSent, 3);
  assert.equal(counts.interested, 1);
  assert.equal(counts.optedOut, 2);
  assert.equal(counts.failed, 2);
  assert.equal(filterProspects(rows, { q: "carlsbad", status: "all" }).length, 3);
  assert.equal(filterProspects(rows, { q: "c@test.com", status: "ready" }).length, 1);
  assert.equal(filterProspects(rows, { q: "hours", status: "sent" }).length, 0);
});

await check("manual prospects sort ahead of the rest", () => {
  const sorted = sortProspects([
    { business_name: "Later", manual_priority: false, last_activity_at: "2026-11-07T00:00:00Z" },
    { business_name: "First", manual_priority: true, last_activity_at: "2026-11-01T00:00:00Z" },
  ]);
  assert.equal(sorted[0].business_name, "First");
});

await check("ready requires eligibility and settings cannot start the scheduler", () => {
  assert.equal(validateStatusChange("ready", false).ok, false);
  assert.equal(validateStatusChange("ready", true).ok, true);
  assert.equal(validateStatusChange("nope", true).ok, false);
  const saved = validateOutreachSettings({
    automationEnabled: "on",
    manualPriority: "on",
    mailingAddress: "100 Main St, Carlsbad, NM",
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.automation_enabled, true);
  assert.equal(saved.value.weekday_target, WEEKDAY_TARGET);
  assert.equal(saved.value.timezone, "America/Denver");
  assert.equal(saved.value.send_hour, 9);
  assert.deepEqual(saved.value.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(OUTREACH_SCHEDULER_ACTIVE, false);
  const paused = validateOutreachSettings({ automationEnabled: undefined, manualPriority: undefined, mailingAddress: "" });
  assert.equal(paused.value.automation_enabled, false);
});

await check("next run is the next weekday at 9:00 AM Denver", () => {
  const fridayMorning = nextScheduledRun(new Date("2026-11-06T15:00:00Z"));
  assert.equal(fridayMorning.toISOString(), "2026-11-06T16:00:00.000Z");
  const fridayAfter = nextScheduledRun(new Date("2026-11-06T17:00:00Z"));
  assert.equal(fridayAfter.toISOString(), "2026-11-09T16:00:00.000Z");
  const saturday = nextScheduledRun(new Date("2026-11-07T18:00:00Z"));
  assert.equal(saturday.toISOString(), "2026-11-09T16:00:00.000Z");
});

await check("mailer has no provider and refuses to send", async () => {
  const mailer = outreachMailer();
  assert.equal(mailer.configured, false);
  assert.equal(mailer.schedulerActive, false);
  await assert.rejects(() => mailer.submit(), /disabled/);
});

await check("pages stay within one query and do not poll", () => {
  assert.equal(shouldPollProspects(), false);
  assert.equal(shouldSubscribeToProspects(), false);
  assert.equal(QUERY_BUDGET_PER_VIEW, 1);
  assert.equal(PAGE_SIZE, 25);
  assert.deepEqual(listWindow(1), { page: 1, limit: 25, offset: 0 });
  assert.equal(listWindow("3").offset, 50);
  assert.equal(sanitizeSearch("  cafe_% "), "cafe");
  const research = validateResearch({
    businessName: "Acme",
    researchNotes: "x".repeat(1001),
    researchSources: "https://example.com",
  });
  assert.equal(research.ok, false);
  const compact = validateResearch({
    businessName: "Acme",
    researchNotes: "Short summary",
    researchSources: "https://example.com/menu",
  });
  assert.equal(compact.ok, true);
  assert.equal(compact.value.researchNotes, "Short summary");
  const plan = retentionPlan();
  assert.ok(plan.preserve.includes("prospect_suppressions"));
  assert.ok(plan.preserve.includes("customers"));
  assert.equal(plan.storageObjects, 0);
  assert.equal(retryBudget(0).allowed, true);
  assert.equal(retryBudget(2).allowed, false);
  assert.equal(retryBudget(2).timeoutMs, 8000);
  assert.equal(sumRecentWrites([{ writes: 2 }, { writes: 3 }]), 5);
  assert.match(PHASE_RULES.x7, /summary/i);
  assert.match(PHASE_RULES.x8, /not the email body/i);
  assert.match(PHASE_RULES.x9, /suppression/i);
});

await check("prospect admin code does not send mail or store a password", () => {
  const action = readFileSync(new URL("../app/admin/prospect-actions.ts", import.meta.url), "utf8");
  const queries = readFileSync(new URL("../lib/prospects/queries.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/admin/(dashboard)/prospects/page.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/011_prospective_clients.sql", import.meta.url), "utf8");
  const limits = readFileSync(new URL("../supabase/migrations/012_prospect_free_plan.sql", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/admin/AdminShell.tsx", import.meta.url), "utf8");
  assert.match(action, /getAdminUser/);
  assert.match(action, /admin_add_prospect/);
  assert.doesNotMatch(action, /static-forms|outreachMailer|claim_outreach_run|setInterval|SUPABASE_SERVICE_ROLE_KEY|\bpassword\b/);
  assert.doesNotMatch(queries, /select\("\*"\)|channel\(|setInterval/);
  assert.match(queries, /prospect_dashboard/);
  assert.doesNotMatch(page, /setInterval|channel\(/);
  assert.match(limits, /scheduler_live = false/);
  assert.match(limits, /cleanup_prospect_operations/);
  assert.doesNotMatch(limits, /alter table public\.customers|create publication|supabase_realtime|storage\.buckets/i);
  assert.match(shell, /Prospective Clients/);
  assert.match(migration, /is_admin\(\)/);
  assert.match(migration, /unsubscribe_token/);
  assert.doesNotMatch(migration, /\bpassword\b|alter table public\.customers|alter table public\.payments|alter table public\.consultations/i);
  assert.doesNotMatch(migration, /cron|pg_cron|net\.http/i);
});

console.log(`\n${passed} prospect checks passed`);
