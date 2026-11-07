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
export const OUTREACH_TIMEZONE = "America/Denver";
export const OUTREACH_HOUR = 9;
export const OUTREACH_MINUTE = 0;
export const OUTREACH_WEEKDAYS = [1, 2, 3, 4, 5];

/** This phase stores settings only. No job is allowed to send email. */
export const OUTREACH_SCHEDULER_ACTIVE = false;

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

  return {
    ok: errors.length === 0,
    errors,
    value: {
      businessName: collapse(input.businessName),
      city: collapse(input.city),
      serviceArea: text("Service area", input.serviceArea, 160),
      industry: text("Industry", input.industry, 120),
      websiteUrl: website ? website.url : "",
      websiteHost: website ? website.host : "",
      publicEmail,
      secondaryEmail,
      researchNotes: text("Research notes", input.researchNotes, 4000),
      researchSources: text("Research sources", input.researchSources, 2000),
      websiteOpportunities: text("Website opportunities", input.websiteOpportunities, 4000),
      gbpObservations: text("Google Business observations", input.gbpObservations, 4000),
      researchedAt: String(input.researchedAt || "").trim(),
      researchConfidence: confidence,
      outreachEligible: input.outreachEligible === true || input.outreachEligible === "on",
      notes: text("Notes", input.notes, 2000),
    },
  };
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

export function filterProspects(rows, query) {
  const q = collapse(query.q).toLowerCase();
  const status = String(query.status || "all");
  return (rows || []).filter((row) => {
    if (status !== "all" && row.status !== status) return false;
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

export function validateOutreachSettings(input) {
  const address = String(input.mailingAddress || "").trim();
  if (address.length > 300) {
    return { ok: false, error: "Mailing address is too long.", value: null };
  }
  return {
    ok: true,
    error: "",
    value: {
      automation_enabled: input.automationEnabled === true || input.automationEnabled === "on",
      weekday_target: WEEKDAY_TARGET,
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

export function emptyDailyResults() {
  return {
    date: null,
    targeted: 0,
    submitted: 0,
    skipped: 0,
    failed: 0,
  };
}
