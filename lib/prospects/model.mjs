export const PROSPECT_STATUSES = [
  "queued",
  "researching",
  "ready",
  "sent",
  "interested",
  "not_interested",
  "bounced",
  "failed",
  "do_not_contact",
];

export const STATUS_LABELS = {
  queued: "Queued",
  researching: "Researching",
  ready: "Ready",
  sent: "Sent",
  interested: "Interested",
  not_interested: "Not interested",
  bounced: "Bounced",
  failed: "Failed",
  do_not_contact: "Do not contact",
};

export const WEEKDAY_TARGET = 5;
export const DAILY_TARGET_MIN = 1;
export const DAILY_TARGET_MAX = 10;
/** About 22 Mondays–Fridays in a month. Used only for the volume estimate. */
export const WEEKDAYS_PER_MONTH = 22;
export const OUTREACH_TIMEZONE = "America/Denver";
export const OUTREACH_HOUR = 9;
export const OUTREACH_MINUTE = 0;
export const OUTREACH_WEEKDAYS = [1, 2, 3, 4, 5];

/** Weekday batches run at 9:00 AM America/Denver. A mailing address is also required. */
export const OUTREACH_SCHEDULER_ACTIVE = true;

export function externalOutreachAllowed(settings) {
  if (!OUTREACH_SCHEDULER_ACTIVE) return false;
  return String(settings?.mailingAddress || settings?.mailing_address || "").trim().length > 0;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function collapse(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeName(value) {
  return collapse(value).toLowerCase();
}

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email;
}

export function parseWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\s*javascript:/i.test(raw) || /\s/.test(raw)) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || !host.includes(".")) return null;
    url.hash = "";
    return { url: url.toString(), host };
  } catch {
    return null;
  }
}

export function validateManualProspect(input) {
  const businessName = collapse(input.businessName);
  const city = collapse(input.city);
  const email = normalizeEmail(input.email);
  const notes = String(input.notes || "").trim();
  const errors = [];

  if (businessName.length < 2) errors.push("Enter the business name.");
  if (businessName.length > 120) errors.push("Business name is too long.");
  if (city.length > 80) errors.push("City is too long.");
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push("Enter a valid email or leave it blank.");
  }
  if (notes.length > 2000) errors.push("Notes are too long.");

  const website = parseWebsite(input.website);
  if (String(input.website || "").trim() && !website) {
    errors.push("Enter a valid website or leave it blank.");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      businessName,
      city,
      email,
      websiteUrl: website ? website.url : "",
      websiteHost: website ? website.host : "",
      notes,
      status: "queued",
      source: "manual",
      manualPriority: true,
      outreachEligible: false,
    },
  };
}

export function validateResearch(input) {
  const errors = [];
  const publicEmail = normalizeEmail(input.publicEmail);
  const secondaryEmail = normalizeEmail(input.secondaryEmail);
  const website = parseWebsite(input.website);
  const confidence = String(input.researchConfidence || "").trim();

  if (publicEmail && !EMAIL_PATTERN.test(publicEmail)) {
    errors.push("Public email is not valid.");
  }
  if (secondaryEmail && !EMAIL_PATTERN.test(secondaryEmail)) {
    errors.push("Secondary email is not valid.");
  }
  if (publicEmail && secondaryEmail && publicEmail === secondaryEmail) {
    errors.push("The two emails should be different.");
  }
  if (String(input.website || "").trim() && !website) {
    errors.push("Website is not valid.");
  }
  if (confidence && !["low", "medium", "high"].includes(confidence)) {
    errors.push("Research confidence must be low, medium, or high.");
  }

  const text = (name, value, max) => {
    const clean = String(value || "").trim();
    if (clean.length > max) errors.push(`${name} is too long.`);
    return clean;
  };
  const value = {
    businessName: collapse(input.businessName),
    city: collapse(input.city),
    serviceArea: text("Service area", input.serviceArea, 160),
    industry: text("Industry", input.industry, 120),
    websiteUrl: website ? website.url : "",
    websiteHost: website ? website.host : "",
    publicEmail,
    secondaryEmail,
    researchNotes: text("Research summary", input.researchNotes, 1000),
    researchSources: text("Source URLs", input.researchSources, 800),
    websiteOpportunities: text("Website opportunities", input.websiteOpportunities, 1000),
    gbpObservations: text("Google Business observations", input.gbpObservations, 1000),
    researchedAt: String(input.researchedAt || "").trim(),
    researchConfidence: confidence,
    outreachEligible: input.outreachEligible === true || input.outreachEligible === "on",
    notes: text("Notes", input.notes, 2000),
  };

  return { ok: errors.length === 0, errors, value };
}

export function sameBusiness(left, right) {
  const name = normalizeName(left.businessName || left.business_name);
  const city = normalizeName(left.city || "");
  const email = normalizeEmail(left.email || left.public_email || left.publicEmail);
  const host = left.websiteHost || left.website_host || parseWebsite(left.website || left.website_url)?.host || "";

  const otherName = normalizeName(right.business_name || right.businessName);
  const otherCity = normalizeName(right.city || "");
  const otherEmail = normalizeEmail(right.public_email || right.email || "");
  const otherHost = right.website_host || parseWebsite(right.website_url || "")?.host || "";

  if (email && otherEmail && email === otherEmail) return "email";
  if (host && otherHost && host === otherHost) return "website";
  if (name && name === otherName && city === otherCity) return "name";
  return "";
}

export function findDuplicate(existing, input) {
  return (existing || []).find((row) => sameBusiness(input, row)) || null;
}

export function findSuppression(suppressions, input) {
  return (suppressions || []).find((row) => sameBusiness(input, {
    business_name: row.business_name,
    city: row.city,
    public_email: row.email,
    website_host: row.website_host,
  })) || null;
}

export function countProspects(rows) {
  const list = rows || [];
  const is = (status) => list.filter((row) => row.status === status).length;
  return {
    total: list.length,
    awaitingResearch: is("queued") + is("researching"),
    ready: is("ready"),
    emailsSent: list.filter((row) => {
      if (row.status === "bounced" || row.status === "failed") return false;
      return Boolean(row.sent_at) || row.status === "sent" || row.status === "interested";
    }).length,
    interested: is("interested"),
    optedOut: is("not_interested") + is("do_not_contact"),
    failed: is("failed") + is("bounced"),
  };
}

export function matchesProspectStatus(row, status) {
  const key = String(status || "all");
  if (key === "all") return true;
  if (key === "awaiting") return row?.status === "queued" || row?.status === "researching";
  if (key === "contacted") {
    if (row?.status === "bounced" || row?.status === "failed") return false;
    return Boolean(row?.sent_at || row?.sentAt) || row?.status === "sent" || row?.status === "interested";
  }
  if (key === "opted_out") return row?.status === "not_interested" || row?.status === "do_not_contact";
  if (key === "needs_review") return row?.status === "failed" || row?.status === "bounced";
  return row?.status === key;
}

export function isGroupedProspectStatus(status) {
  return ["awaiting", "contacted", "opted_out", "needs_review"].includes(String(status || ""));
}

export function filterProspects(rows, query) {
  const q = collapse(query.q).toLowerCase();
  const status = String(query.status || "all");
  return (rows || []).filter((row) => {
    if (!matchesProspectStatus(row, status)) return false;
    if (!q) return true;
    const haystack = [
      row.business_name,
      row.city,
      row.service_area,
      row.industry,
      row.public_email,
      row.secondary_email,
      row.website_url,
      row.notes,
      row.research_notes,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function sortProspects(rows) {
  return [...(rows || [])].sort((a, b) => {
    const priority = Number(Boolean(b.manual_priority)) - Number(Boolean(a.manual_priority));
    if (priority) return priority;
    return new Date(b.last_activity_at || b.created_at || 0).getTime()
      - new Date(a.last_activity_at || a.created_at || 0).getTime();
  });
}

export function statusTimestampColumn(status) {
  return {
    queued: "queued_at",
    ready: "ready_at",
    sent: "sent_at",
    interested: "interested_at",
    not_interested: "opted_out_at",
    bounced: "bounced_at",
    failed: "failed_at",
    do_not_contact: "do_not_contact_at",
  }[status] || null;
}

export function suppressesOutreach(status) {
  return status === "not_interested" || status === "do_not_contact";
}

export function validateStatusChange(status, outreachEligible) {
  if (!PROSPECT_STATUSES.includes(status)) {
    return { ok: false, error: "Choose a valid status." };
  }
  if (status === "ready" && !outreachEligible) {
    return { ok: false, error: "Mark the business eligible for outreach before setting it to Ready." };
  }
  return { ok: true, error: "" };
}

export function clampDailyTarget(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < DAILY_TARGET_MIN || number > DAILY_TARGET_MAX) {
    return WEEKDAY_TARGET;
  }
  return number;
}

export function monthlyOutreachVolume(target) {
  return clampDailyTarget(target) * WEEKDAYS_PER_MONTH;
}

/** Successful submissions, including a retry that was accepted. Research does not count. */
export function canSubmitOutreach({ target, submittedToday }) {
  const limit = clampDailyTarget(target);
  const submitted = Math.max(0, Number(submittedToday) || 0);
  return {
    allowed: submitted < limit,
    remaining: Math.max(0, limit - submitted),
    target: limit,
    submitted,
  };
}

export function validateOutreachSettings(input) {
  const address = String(input.mailingAddress || "").trim();
  if (address.length > 300) {
    return { ok: false, error: "Mailing address is too long.", value: null };
  }
  const paused = input.pauseAutomation === true || input.pauseAutomation === "on";
  const requested = input.weekdayTarget;
  let weekdayTarget = WEEKDAY_TARGET;
  if (requested !== undefined && requested !== null && String(requested).trim() !== "") {
    const number = Number(requested);
    if (!Number.isInteger(number) || number < DAILY_TARGET_MIN || number > DAILY_TARGET_MAX) {
      return { ok: false, error: "Choose a daily target from 1 to 10.", value: null };
    }
    weekdayTarget = number;
  }
  return {
    ok: true,
    error: "",
    value: {
      automation_enabled: !paused && (input.automationEnabled === true || input.automationEnabled === "on"),
      weekday_target: weekdayTarget,
      timezone: OUTREACH_TIMEZONE,
      send_hour: OUTREACH_HOUR,
      send_minute: OUTREACH_MINUTE,
      weekdays: OUTREACH_WEEKDAYS,
      manual_priority: input.manualPriority === true || input.manualPriority === "on",
      mailing_address: address,
    },
  };
}

function denverParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OUTREACH_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

function zonedToUtc(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatted = denverParts(new Date(guess));
  const asUtc = Date.UTC(
    formatted.year,
    formatted.month - 1,
    formatted.day,
    formatted.hour,
    formatted.minute,
    0
  );
  return new Date(guess - (asUtc - guess));
}

function addDays(year, month, day, amount) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function denverClock(date = new Date()) {
  return denverParts(date);
}

export function sameDenverDay(left, right) {
  if (!left || !right) return false;
  const a = denverParts(new Date(left));
  const b = denverParts(new Date(right));
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** True only during the 9:00 AM hour on a Denver weekday. A missed window is not caught up. */
export function inWeekdaySendWindow(date = new Date()) {
  const local = denverParts(date);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(local.weekday)
    && local.hour === OUTREACH_HOUR
    && local.minute < 20;
}

export function denverDayRange(date = new Date()) {
  const local = denverParts(date);
  const start = zonedToUtc(local.year, local.month, local.day, 0, 0);
  const next = addDays(local.year, local.month, local.day, 1);
  const end = zonedToUtc(next.year, next.month, next.day, 0, 0);
  const key = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  return { start: start.toISOString(), end: end.toISOString(), key };
}

export function nextScheduledRun(now = new Date()) {
  const local = denverParts(now);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addDays(local.year, local.month, local.day, offset);
    const candidate = zonedToUtc(day.year, day.month, day.day, OUTREACH_HOUR, OUTREACH_MINUTE);
    const weekday = denverParts(candidate).weekday;
    const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
    if (isWeekday && candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}

/** Next weekday invocation of either research cron. This does not send email. */
export function nextResearchRun(now = new Date()) {
  let soonest = null;
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const hour of [15, 16]) {
      const candidate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 0, 0));
      if (candidate.getTime() <= now.getTime()) continue;
      if (!soonest || candidate.getTime() < soonest.getTime()) soonest = candidate;
    }
  }
  return soonest;
}

export function emptyDailyResults() {
  return {
    date: null,
    targeted: 0,
    submitted: 0,
    skipped: 0,
    failed: 0,
  };
}

export const PAGE_SIZE = 25;
export const FALLBACK_REQUESTS = 3;
export const ACTIVITY_LIMIT = 20;
export const MAX_RETRIES = 2;
export const REQUEST_TIMEOUT_MS = 8000;
export const QUERY_BUDGET_PER_VIEW = 1;
export const LIST_NOTE_CHARS = 140;

export const LIST_COLUMNS = [
  "id",
  "business_name",
  "city",
  "service_area",
  "public_email",
  "website_host",
  "status",
  "last_activity_at",
  "notes",
  "manual_priority",
];

/** Future phases import these limits. They do not run in this phase. */
export const PHASE_RULES = {
  x7: "Research at most 5 prospects in one weekday claim. Save a short summary and source URLs only. Do not store pages, images, or model output. Stop after one claim.",
  x8: "Send only when claim_outreach_run returns true. One message per prospect. Log the result, not the email body or provider payload. Stop after 2 failed attempts.",
  x9: "Read replies and unsubscribe requests in that same weekday claim, then release the lock. Keep suppression and compliance rows. Do not add a Supabase project, realtime channel, or storage bucket.",
};

export function sanitizeSearch(value) {
  return collapse(value).replace(/[%_,()]/g, "").slice(0, 80);
}

export function listWindow(page) {
  const current = Math.min(Math.max(Number(page) || 1, 1), 400);
  return {
    page: current,
    limit: PAGE_SIZE,
    offset: (current - 1) * PAGE_SIZE,
  };
}

export function shouldPollProspects() {
  return false;
}

export function shouldSubscribeToProspects() {
  return false;
}

export function retentionPlan() {
  return {
    deleteActivityOlderThanDays: 180,
    keepActivityStatuses: ["not_interested", "do_not_contact"],
    deleteUsageOlderThanDays: 90,
    preserve: ["prospect_suppressions", "unsubscribe_token", "customers", "payments", "consultations"],
    storageObjects: 0,
  };
}

export function retryBudget(failures) {
  const used = Math.max(0, Number(failures) || 0);
  return {
    used,
    max: MAX_RETRIES,
    allowed: used < MAX_RETRIES,
    timeoutMs: REQUEST_TIMEOUT_MS,
  };
}

export function sumRecentWrites(rows) {
  return (rows || []).reduce((total, row) => total + Number(row.writes || 0), 0);
}

export const LIST_SELECT = "id,business_name,city,service_area,public_email,website_host,status,last_activity_at,notes,manual_priority,research_notes,research_sources,queued_at";
export const DETAIL_SELECT = "id,business_name,city,service_area,industry,website_url,website_host,public_email,secondary_email,research_notes,research_sources,website_opportunities,gbp_observations,researched_at,research_confidence,outreach_eligible,status,source,manual_priority,notes,last_activity_at,unsubscribe_token";
export const ACTIVITY_SELECT = "id,event_type,from_status,to_status,note,created_at";
export const SETTINGS_SELECT = "automation_enabled,weekday_target,timezone,send_hour,send_minute,weekdays,manual_priority,mailing_address,last_run_at,last_run_summary";
export const COUNT_SELECT = "status,sent_at";

function quoted(value) {
  return `"${String(value || "").replace(/"/g, "")}"`;
}

export function searchOr(value) {
  const safe = sanitizeSearch(value);
  if (!safe) return "";
  const term = quoted(`%${safe}%`);
  return ["business_name", "city", "public_email", "website_host", "notes"]
    .map((column) => `${column}.ilike.${term}`)
    .join(",");
}

export function suppressionOr(input) {
  const parts = [];
  const email = normalizeEmail(input.email || input.publicEmail || "");
  const host = input.websiteHost || "";
  const name = collapse(input.businessName || "");
  const city = collapse(input.city || "");
  if (email) parts.push(`email.eq.${quoted(email)}`);
  if (host) parts.push(`website_host.eq.${quoted(host)}`);
  if (name) {
    const cityMatch = city
      ? `city.ilike.${quoted(city)}`
      : `or(city.is.null,city.eq.${quoted("")})`;
    parts.push(`and(business_name.ilike.${quoted(name)},${cityMatch})`);
  }
  return parts.join(",");
}

export function settingsFromRow(row) {
  if (!row) return null;
  return {
    automation_enabled: Boolean(row.automation_enabled),
    weekday_target: clampDailyTarget(row.weekday_target),
    timezone: "America/Denver",
    send_hour: 9,
    send_minute: 0,
    weekdays: row.weekdays || [1, 2, 3, 4, 5],
    manual_priority: row.manual_priority !== false,
    mailing_address: row.mailing_address || null,
    last_run_at: row.last_run_at || null,
    last_run_summary: row.last_run_summary || {},
    last_cleanup_at: null,
    consecutive_failures: 0,
    max_retries: MAX_RETRIES,
    request_timeout_seconds: REQUEST_TIMEOUT_MS / 1000,
    scheduler_live: false,
    run_lock_until: null,
  };
}
