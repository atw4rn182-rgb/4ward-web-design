import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  OUTREACH_SCHEDULER_ACTIVE,
  externalOutreachAllowed,
  FALLBACK_REQUESTS,
  LIST_SELECT,
  PAGE_SIZE,
  PHASE_RULES,
  QUERY_BUDGET_PER_VIEW,
  WEEKDAY_TARGET,
  canSubmitOutreach,
  countProspects,
  filterProspects,
  monthlyOutreachVolume,
  findDuplicate,
  findSuppression,
  listWindow,
  denverDayRange,
  inWeekdaySendWindow,
  nextScheduledRun,
  parseWebsite,
  retentionPlan,
  retryBudget,
  sanitizeSearch,
  searchOr,
  settingsFromRow,
  shouldPollProspects,
  shouldSubscribeToProspects,
  sortProspects,
  sumRecentWrites,
  suppressionOr,
  validateManualProspect,
  validateOutreachSettings,
  validateResearch,
  validateStatusChange,
} from "../lib/prospects/model.mjs";
import { outreachMailer } from "../lib/prospects/mailer.mjs";
import {
  buildDraft,
  discoveryProvider,
  extractPublicContacts,
  packResearchRecord,
  qualifyProspect,
  readResearchRecord,
  robotsAllows,
  selectResearchBatch,
} from "../lib/prospects/research.mjs";
import { readOwnWebsite, researchFromRecord } from "../lib/prospects/research-run.mjs";
import { isClosedProspect, selectWeekdayRecipients } from "../lib/prospects/weekday.mjs";
import { outreachHistory } from "../lib/prospects/history.mjs";
import { deliveryShortfall, discoveryNeed, readinessBlock, selectPendingForReview, upcomingRecipients, verificationBlock } from "../lib/prospects/discovery.mjs";
import { nextResearchRun } from "../lib/prospects/model.mjs";

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
  assert.equal(filterProspects(rows, { status: "awaiting" }).length, 2);
  assert.equal(filterProspects(rows, { status: "contacted" }).length, 3);
  assert.equal(filterProspects(rows, { status: "opted_out" }).length, 2);
  assert.equal(filterProspects(rows, { status: "needs_review" }).length, 2);
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
  assert.equal(OUTREACH_SCHEDULER_ACTIVE, true);
  const paused = validateOutreachSettings({ automationEnabled: undefined, manualPriority: undefined, mailingAddress: "" });
  assert.equal(paused.value.automation_enabled, false);
  const chosen = validateOutreachSettings({ weekdayTarget: "7", pauseAutomation: "on", automationEnabled: "on", manualPriority: "on" });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.value.weekday_target, 7);
  assert.equal(chosen.value.automation_enabled, false);
  assert.equal(chosen.value.timezone, "America/Denver");
  assert.equal(validateOutreachSettings({ weekdayTarget: "11" }).ok, false);
  assert.equal(monthlyOutreachVolume(5), 110);
  assert.equal(monthlyOutreachVolume(10), 220);
  assert.equal(canSubmitOutreach({ target: 5, submittedToday: 4 }).allowed, true);
  assert.equal(canSubmitOutreach({ target: 5, submittedToday: 5 }).allowed, false);
  assert.equal(canSubmitOutreach({ target: 5, submittedToday: 5 }).remaining, 0);
  assert.equal(settingsFromRow({ automation_enabled: false, manual_priority: true, weekday_target: 8 }).weekday_target, 8);
});

await check("next run is the next weekday at 9:00 AM Denver", () => {
  const fridayMorning = nextScheduledRun(new Date("2026-11-06T15:00:00Z"));
  assert.equal(fridayMorning.toISOString(), "2026-11-06T16:00:00.000Z");
  const fridayAfter = nextScheduledRun(new Date("2026-11-06T17:00:00Z"));
  assert.equal(fridayAfter.toISOString(), "2026-11-09T16:00:00.000Z");
  const saturday = nextScheduledRun(new Date("2026-11-07T18:00:00Z"));
  assert.equal(saturday.toISOString(), "2026-11-09T16:00:00.000Z");
  assert.equal(inWeekdaySendWindow(new Date("2026-11-09T16:00:00Z")), true);
  assert.equal(inWeekdaySendWindow(new Date("2026-11-09T15:00:00Z")), false);
  assert.equal(inWeekdaySendWindow(new Date("2026-07-13T15:00:00Z")), true);
  assert.equal(inWeekdaySendWindow(new Date("2026-07-13T16:00:00Z")), false);
  assert.equal(inWeekdaySendWindow(new Date("2026-11-07T16:00:00Z")), false);
  assert.equal(denverDayRange(new Date("2026-11-09T16:00:00Z")).key, "2026-11-09");
});

await check("weekday selection keeps safeguards and skips closed or personal mail", () => {
  assert.equal(isClosedProspect({ notes: "Listed as closed." }), true);
  assert.equal(isClosedProspect({ notes: "Sunday Closed" }), false);
  const rows = [
    { id: "1", status: "ready", outreach_eligible: true, public_email: "office@shop.example", business_name: "Shop", city: "Artesia" },
    { id: "2", status: "ready", outreach_eligible: true, public_email: "owner@gmail.com", business_name: "Owner", city: "Artesia" },
    { id: "3", status: "ready", outreach_eligible: true, public_email: "closed@shop.example", notes: "Permanently closed.", business_name: "Closed", city: "Carlsbad" },
    { id: "4", status: "ready", outreach_eligible: true, public_email: "nereecerodriguez956@gmail.com", notes: "One-time test. Exclude from all future outreach.", business_name: "Nereece", city: "Carlsbad" },
    { id: "5", status: "sent", outreach_eligible: true, public_email: "old@shop.example", business_name: "Old", city: "Artesia" },
    { id: "6", status: "ready", outreach_eligible: true, public_email: "buyer@shop.example", business_name: "Buyer", city: "Hobbs" },
    { id: "7", status: "ready", outreach_eligible: true, public_email: "refused@shop.example", business_name: "Refused", city: "Artesia" },
  ];
  const picked = selectWeekdayRecipients(rows, { limit: 5, customerEmails: ["buyer@shop.example"], uncertainIds: [], refusedIds: ["7"] });
  assert.deepEqual(picked.chosen.map((row) => row.id), ["1"]);
  assert.ok(picked.skipped.some((row) => row.reason === "refused"));
  assert.ok(picked.skipped.some((row) => row.reason === "personal-email"));
  assert.ok(picked.skipped.some((row) => row.reason === "closed"));
  assert.ok(picked.skipped.some((row) => row.reason === "one-time"));
  assert.ok(picked.skipped.some((row) => row.reason === "existing-customer"));
});

await check("email history reads the saved acceptance and does not send", () => {
  const entries = outreachHistory(
    [
      { id: "a", event_type: "gmail_accepted", created_at: "2026-11-07T23:00:00Z", note: "Gmail accepted the message. Message ID: 1a1b891b08ed5999. Inbox delivery was not checked." },
      { id: "b", event_type: "status", created_at: "2026-11-07T23:01:00Z", note: "queued" },
    ],
    { business_name: "Artesia Plumbing Heating & Cooling", city: "Artesia", industry: "plumbing", public_email: "artesiaplumbing@gmail.com", website_host: "", notes: "" },
    "4Ward Web Design\nPO BOX 1161\nCARLSBAD NM 88220"
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "Accepted by Gmail");
  assert.equal(entries[0].messageId, "1a1b891b08ed5999");
  assert.equal(entries[0].at, "2026-11-07T23:00:00Z");
  assert.equal(entries[0].origin, "reconstructed");
  assert.match(entries[0].body, /No business-owned website found/);
  assert.match(entries[0].body, /Adam Windhorst/);
  assert.doesNotMatch(entries[0].body, /no website/i);
  const saved = outreachHistory([
    { id: "11111111-1111-4111-8111-111111111111", event_type: "email_snapshot", created_at: "2026-11-07T22:59:00Z", note: JSON.stringify({ templateVersion: "outreach-letter-2026-11", recipient: "office@shop.example", subject: "Saved subject", text: "Saved plain text", html: "<p>Saved</p>" }) },
    { id: "acc-1", event_type: "gmail_accepted", created_at: "2026-11-07T23:00:00Z", note: "Gmail accepted the message. Message ID: abcdef123456. Snapshot: 11111111-1111-4111-8111-111111111111. Inbox delivery was not checked." },
  ], { business_name: "Shop", city: "Hobbs", public_email: "office@shop.example" }, "");
  assert.equal(saved[0].origin, "snapshot");
  assert.equal(saved[0].subject, "Saved subject");
  assert.equal(saved[0].body, "Saved plain text");
  assert.equal(saved[0].messageId, "abcdef123456");
  assert.equal(verificationBlock({ status: "queued", city: "Lovington", public_email: "office@shop.example", research_sources: "https://example.com/listing", website_host: "", notes: "" }), "");
  assert.equal(verificationBlock({ status: "queued", city: "Lovington", public_email: "nereecerodriguez956@gmail.com", research_sources: "https://example.com/listing", notes: "One-time test." }), "one-time");
  assert.equal(discoveryNeed(0), 50);
  assert.equal(discoveryNeed(19), 31);
  assert.equal(discoveryNeed(20), 0);
  assert.equal(discoveryNeed(50), 0);
  const pending = [
    { id: "1", status: "queued", business_name: "Shop", city: "Hobbs", public_email: "office@shop.example", research_sources: "https://example.com/a", website_host: "" },
    { id: "2", status: "queued", business_name: "Shop", city: "Hobbs", public_email: "office@shop.example", research_sources: "https://example.com/a", website_host: "" },
  ];
  assert.equal(selectPendingForReview(pending, 5).chosen.length, 1);
  assert.equal(selectPendingForReview(pending, 5).skipped.some((row) => row.reason === "duplicate"), true);
  const fresh = { status: "ready", outreach_eligible: true, city: "Lovington", public_email: "office@shop.example", research_sources: "https://example.com/listing", website_host: "", researched_at: "2026-11-01T16:00:00Z", research_notes: "Published email office@shop.example was already saved." };
  assert.equal(readinessBlock(fresh, new Date("2026-11-08T16:00:00Z")), "");
  assert.equal(readinessBlock({ ...fresh, researched_at: "2026-09-01T16:00:00Z" }, new Date("2026-11-08T16:00:00Z")), "stale");
  assert.equal(readinessBlock({ ...fresh, research_notes: "A different address other@shop.example was published." }, new Date("2026-11-08T16:00:00Z")), "conflicting");
  assert.equal(upcomingRecipients([fresh], new Date("2026-11-08T16:00:00Z")).length, 1);
  assert.equal(deliveryShortfall(0, 0), 5);
  assert.equal(deliveryShortfall(2, 1), 2);
  const researchAt = nextResearchRun(new Date("2026-11-08T01:43:00Z"));
  assert.equal(researchAt.toISOString(), "2026-11-09T15:00:00.000Z");
});

await check("mailer has no provider and refuses to send", async () => {
  const mailer = outreachMailer();
  assert.equal(mailer.configured, false);
  assert.equal(mailer.schedulerActive, true);
  await assert.rejects(() => mailer.submit(), /disabled/);
});

await check("pages stay within one query and do not poll", () => {
  assert.equal(shouldPollProspects(), false);
  assert.equal(shouldSubscribeToProspects(), false);
  assert.equal(QUERY_BUDGET_PER_VIEW, 1);
  assert.equal(FALLBACK_REQUESTS, 3);
  assert.equal(PAGE_SIZE, 25);
  assert.equal(LIST_SELECT.includes("*"), false);
  assert.equal(searchOr("cafe_%,").startsWith('business_name.ilike."%cafe%"'), true);
  assert.equal(searchOr("%_,"), "");
  assert.match(suppressionOr({ businessName: "Acme", city: "", email: "a@b.co", websiteHost: "acme.com" }), /email.eq."a@b.co"/);
  assert.equal(settingsFromRow({ automation_enabled: true, manual_priority: true }).scheduler_live, false);
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

await check("manual prospects are researched before discovered ones and duplicates are skipped", () => {
  const batch = selectResearchBatch([
    { id: "a", status: "queued", manual_priority: false, business_name: "Auto Shop", city: "Artesia", public_email: "", last_activity_at: "2026-11-01" },
    { id: "b", status: "queued", manual_priority: true, business_name: "Manual Welding", city: "Carlsbad", public_email: "office@manual.example", last_activity_at: "2026-11-02" },
    { id: "c", status: "queued", manual_priority: false, business_name: "Manual Welding", city: "Carlsbad", public_email: "", last_activity_at: "2026-11-03" },
    { id: "d", status: "do_not_contact", manual_priority: true, business_name: "Closed", city: "Loving", public_email: "", last_activity_at: "2026-11-04" },
  ], 5);
  assert.equal(batch.chosen[0].id, "b");
  assert.equal(batch.chosen.some((row) => row.id === "c"), false);
  assert.equal(batch.skipped.some((row) => row.reason === "duplicate"), true);
  assert.equal(batch.skipped.some((row) => row.reason === "suppressed"), true);
});

await check("qualification does not invent a contact or a missing website", () => {
  const missing = qualifyProspect({ businessName: "Hope Plumbing", city: "Hope", publicEmail: "" });
  assert.equal(missing.qualification, "no_verified_contact");
  assert.match(missing.reason, /not guessed/i);
  const outside = qualifyProspect({ businessName: "Far Shop", city: "Albuquerque", publicEmail: "info@farshop.com" });
  const hobbs = qualifyProspect({ businessName: "Lea Shop", city: "Hobbs", publicEmail: "info@leashop.com", websiteHost: "" });
  assert.equal(hobbs.qualification, "qualified");
  assert.equal(outside.qualification, "not_qualified");
  const personal = qualifyProspect({ businessName: "Local Clean", city: "Loving", publicEmail: "owner@gmail.com" });
  assert.equal(personal.qualification, "needs_review");
  const blocked = qualifyProspect({ businessName: "Blocked", city: "Carlsbad", publicEmail: "info@blocked.com", suppressed: true });
  assert.equal(blocked.qualification, "suppressed");
  assert.equal(blocked.outreachEligible, false);
  const ready = qualifyProspect({ businessName: "Carlsbad Welding", city: "Carlsbad", publicEmail: "info@carlsbadwelding.com", websiteHost: "carlsbadwelding.com" });
  assert.equal(ready.qualification, "qualified");
  const draft = buildDraft({ ...ready, businessName: "Carlsbad Welding", city: "Carlsbad", websiteHost: "carlsbadwelding.com", mailingAddress: "" });
  assert.match(draft.body, /Adam Windhorst/);
  assert.match(draft.body, /Carlsbad Welding/);
  assert.match(draft.body, /carlsbadwelding\.com/);
  assert.match(draft.body, /free, no-obligation consultation/);
  assert.match(draft.body, /View Our Website: https:\/\/www\.4wardwebdesign\.com/);
  assert.match(draft.body, /Watch Our Commercial: https:\/\/www\.4wardwebdesign\.com\/assets\/4ward-commercial\.mp4/);
  assert.match(draft.body, /4wardwebdesigns@gmail\.com/);
  assert.match(draft.body, /560-2575/);
  assert.match(draft.body, /PO BOX 1161/);
  assert.match(draft.body, /CARLSBAD NM 88220/);
  assert.match(draft.body, /30% off the first month/);
  assert.match(draft.body, /offer=local#pricing/);
  assert.match(draft.body, /offer=service#pricing/);
  assert.match(draft.body, /offer=both#pricing/);
  assert.match(draft.body, /within 14 days/);
  assert.match(draft.body, /\$200 launch fee stays \$200/);
  assert.ok(draft.body.length <= 2000);
  assert.match(draft.body, /ask to be removed/);
  assert.doesNotMatch(draft.body, /204 Shaw/);
  assert.doesNotMatch(draft.body, /outdated|ranking|poor website|no website|Google Business Profile issue/i);
  const custom = buildDraft({ ...ready, businessName: "Carlsbad Welding", city: "Carlsbad", websiteHost: "carlsbadwelding.com", mailingAddress: "100 Main St\nCarlsbad, NM 88220" });
  assert.match(custom.body, /100 Main St/);
  assert.doesNotMatch(custom.body, /PO BOX 1161/);
  assert.equal(buildDraft(missing), null);
  assert.equal(externalOutreachAllowed({ mailingAddress: "", schedulerActive: true }), false);
  assert.equal(externalOutreachAllowed({ mailingAddress: "PO BOX 1161", schedulerActive: true }), true);
});

await check("research reads only permitted public contacts and stays compact", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /private", "/"), true);
  const contacts = extractPublicContacts('<title>Shop</title><a href="mailto:info@shop.test">Email</a><a href="/contact">Contact</a> owner@gmail.com', "https://shop.test/");
  assert.deepEqual(contacts.emails, ["info@shop.test", "owner@gmail.com"]);
  assert.equal(contacts.contactUrl, "https://shop.test/contact");
  const packed = packResearchRecord({
    qualification: "qualified",
    reason: "Public email verified.",
    summary: "Short summary",
    sources: "https://shop.test/",
    draftSubject: "Website help for Shop",
    draftBody: "Hello from Carlsbad.",
    factualNotes: "Public page title: Shop.",
    confidence: "medium",
    email: "info@shop.test",
  });
  const read = readResearchRecord({ research_notes: packed.research_notes, website_opportunities: packed.website_opportunities, research_sources: packed.research_sources });
  assert.equal(read.qualification, "qualified");
  assert.equal(read.draftSubject, "Website help for Shop");
  assert.match(read.draftBody, /Hello from Carlsbad/);
  assert.equal(packed.outreach_eligible, false);
  assert.equal(discoveryProvider().available, false);
  assert.equal(discoveryProvider().tested, false);
  assert.equal(discoveryProvider().options.every((option) => option.enabled === false), true);
});

await check("a blocked or failed website is marked for review and not emailed", async () => {
  const blocked = await readOwnWebsite("https://shop.test/", {
    fetchImpl: async (url) => ({
      status: String(url).endsWith("/robots.txt") ? 200 : 200,
      headers: { get: () => "" },
      text: async () => (String(url).endsWith("/robots.txt") ? "User-agent: *\nDisallow: /" : "<title>Hidden</title>"),
    }),
  });
  assert.equal(blocked.robotsBlocked, true);
  assert.equal(blocked.emails.length, 0);
  const result = researchFromRecord({
    business_name: "Shop",
    city: "Artesia",
    public_email: "info@shop.test",
    website_host: "shop.test",
    website_url: "https://shop.test/",
  }, blocked, "");
  assert.equal(result.qualification, "needs_review");
  assert.equal(result.draftBody, "");
  let calls = 0;
  const failed = await readOwnWebsite("https://shop.test/menu", {
    timeoutMs: 1000,
    fetchImpl: async () => {
      calls += 1;
      return { status: 500, headers: { get: () => "" }, text: async () => "" };
    },
  });
  assert.equal(failed.ok, false);
  assert.ok(calls <= 3);
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
  assert.match(action, /researchProspectAction/);
  assert.match(action, /researchQueueAction/);
  assert.doesNotMatch(action, /discover\(/);
  assert.doesNotMatch(action, /static-forms|outreachMailer|claim_outreach_run|setInterval|SUPABASE_SERVICE_ROLE_KEY|\bpassword\b|scheduler_live/);
  const targetMigration = readFileSync(new URL("../supabase/migrations/013_outreach_daily_target.sql", import.meta.url), "utf8");
  assert.match(targetMigration, /weekday_target >= 1 and weekday_target <= 10/);
  assert.doesNotMatch(targetMigration, /alter table public\.customers|alter table public\.payments|alter table public\.consultations/i);
  assert.doesNotMatch(queries, /select\("\*"\)|channel\(|setInterval/);
  assert.match(queries, /prospect_dashboard/);
  assert.match(queries, /LIST_SELECT/);
  assert.match(action, /addProspectInTables/);
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
