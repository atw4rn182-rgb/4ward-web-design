import { collapse, findSuppression, parseWebsite, sameBusiness, sortProspects } from "./model.mjs";

export const RESEARCH_BATCH_LIMIT = 5;
export const RESEARCH_DEADLINE_MS = 8000;
export const RESEARCH_FAILURE_LIMIT = 2;
export const PORTFOLIO_URL = "https://www.4wardwebdesign.com";
export const BUSINESS_PHONE = "(970) 560-2575";

export const QUALIFICATIONS = [
  "qualified",
  "needs_review",
  "not_qualified",
  "no_verified_contact",
  "suppressed",
];

export function isQualification(value) {
  return QUALIFICATIONS.includes(value);
}

export function qualificationLabel(value) {
  return QUALIFICATION_LABELS[value] || "";
}

export const QUALIFICATION_LABELS = {
  qualified: "Qualified",
  needs_review: "Needs review",
  not_qualified: "Not qualified",
  no_verified_contact: "No verified contact",
  suppressed: "Suppressed",
};

const EDDY_PLACES = [
  "carlsbad",
  "artesia",
  "loving",
  "hope",
  "malaga",
  "loco hills",
  "whites city",
  "la huerta",
  "otis",
  "happy valley",
  "eddy",
];

const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "live.com", "msn.com"];
const BLOCKED_EMAIL_DOMAINS = ["example.com", "example.org", "wixpress.com", "sentry.io", "schema.org", "godaddy.com", "wordpress.com", "squarespace.com"];

const INDUSTRY_HINTS = [
  ["weld", "welding"],
  ["truck", "trucking"],
  ["landscap", "landscaping"],
  ["restaurant", "restaurant"],
  ["cater", "restaurant"],
  ["clean", "cleaning"],
  ["auto", "automotive"],
  ["diesel", "automotive"],
  ["concrete", "construction"],
  ["construct", "construction"],
  ["roof", "roofing"],
  ["plumb", "plumbing"],
  ["electric", "electrical"],
  ["hvac", "HVAC"],
];

export function discoveryOptions() {
  return [
    {
      id: "overpass",
      name: "Public OpenStreetMap server",
      enabled: false,
      cost: "The map data can be reused with attribution. The public lookup server asks commercial projects to run their own server, so it is not called.",
    },
    {
      id: "google-places",
      name: "Google Places",
      enabled: false,
      cost: "Text Search with address and category is about $32 per 1,000 after 5,000 free requests a month. Adding website or phone is about $35 per 1,000 after 1,000 free. It does not return email addresses. Not enabled.",
    },
  ];
}

export function discoveryProvider() {
  return {
    id: "unconfigured",
    available: false,
    tested: false,
    options: discoveryOptions(),
    reason:
      "Automatic discovery is off. No permitted free source is configured for commercial business lookup. Add a business manually, then research that record.",
  };
}

export function inEddyCounty(city, serviceArea) {
  const recorded = collapse(`${city || ""} ${serviceArea || ""}`).toLowerCase();
  if (!recorded) return null;
  return EDDY_PLACES.some((place) => recorded.includes(place));
}

export function industryHint(name) {
  const text = collapse(name).toLowerCase();
  const match = INDUSTRY_HINTS.find(([needle]) => text.includes(needle));
  return match ? match[1] : "";
}

export function isPersonalEmail(email) {
  const domain = String(email || "").toLowerCase().split("@")[1] || "";
  return PERSONAL_DOMAINS.includes(domain);
}

export function isPublishableEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  const domain = value.split("@")[1];
  if (BLOCKED_EMAIL_DOMAINS.includes(domain)) return false;
  if (/^(no-?reply|donotreply|privacy|support@wix)/.test(value)) return false;
  return true;
}

export function robotsAllows(robotsText, path) {
  const target = path && path.startsWith("/") ? path : `/${path || ""}`;
  const lines = String(robotsText || "")
    .split(/\r?\n/)
    .map((line) => line.split("#")[0].trim())
    .filter(Boolean);
  let applies = false;
  let sawStar = false;
  const disallows = [];
  const allows = [];
  for (const line of lines) {
    const agent = line.match(/^user-agent:\s*(.+)$/i);
    if (agent) {
      applies = agent[1].trim() === "*";
      if (applies) sawStar = true;
      continue;
    }
    if (!applies) continue;
    const disallow = line.match(/^disallow:\s*(.*)$/i);
    if (disallow) disallows.push(disallow[1].trim());
    const allow = line.match(/^allow:\s*(.*)$/i);
    if (allow) allows.push(allow[1].trim());
  }
  if (!sawStar) return true;
  if (allows.some((rule) => rule && target.startsWith(rule))) return true;
  if (disallows.some((rule) => rule === "/")) return false;
  return !disallows.some((rule) => rule && target.startsWith(rule));
}

export function extractPublicContacts(html, pageUrl) {
  const source = String(html || "");
  const emails = new Set();
  for (const match of source.matchAll(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    emails.add(match[1].toLowerCase());
  }
  const visible = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  for (const match of visible.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
    emails.add(match[0].toLowerCase());
  }
  const ranked = [...emails]
    .filter(isPublishableEmail)
    .sort((left, right) => rankEmail(left) - rankEmail(right))
    .slice(0, 3);
  let contactUrl = "";
  for (const match of source.matchAll(/href=["']([^"']+)["']/gi)) {
    if (!/contact/i.test(match[1])) continue;
    try {
      const url = new URL(match[1], pageUrl);
      if (url.protocol === "http:" || url.protocol === "https:") contactUrl = url.toString();
    } catch {
      contactUrl = "";
    }
    break;
  }
  const titleMatch = source.match(/<title>([^<]{1,140})<\/title>/i);
  return {
    emails: ranked,
    contactUrl,
    title: titleMatch ? collapse(titleMatch[1]).slice(0, 120) : "",
  };
}

function rankEmail(email) {
  return /^(info|contact|office|hello|sales|service)\b/.test(email.split("@")[0]) ? 0 : 1;
}

export function selectResearchBatch(rows, limit = RESEARCH_BATCH_LIMIT) {
  const ordered = sortProspects(rows || []);
  const chosen = [];
  const skipped = [];
  const seen = [];
  for (const row of ordered) {
    if (row.status === "do_not_contact" || row.status === "not_interested") {
      skipped.push({ id: row.id, reason: "suppressed" });
      continue;
    }
    if (row.status !== "queued" && row.status !== "researching") continue;
    if (seen.find((other) => sameBusiness(row, other))) {
      skipped.push({ id: row.id, reason: "duplicate" });
      continue;
    }
    if (chosen.length >= limit) continue;
    chosen.push(row);
    seen.push(row);
  }
  return { chosen, skipped };
}

export function suppressionMatches(row, suppressions) {
  return findSuppression(suppressions, {
    businessName: row.business_name || row.businessName,
    city: row.city,
    email: row.public_email || row.publicEmail,
    websiteHost: row.website_host || row.websiteHost,
  });
}

export function qualifyProspect(input) {
  const cityKnown = inEddyCounty(input.city, input.serviceArea);
  const email = String(input.publicEmail || input.emailsFound?.[0] || "").trim().toLowerCase();
  const industry = collapse(input.industry) || industryHint(input.businessName);
  const base = { email, industry, outreachEligible: false };

  if (input.suppressed) {
    return {
      ...base,
      qualification: "suppressed",
      confidence: "high",
      reason: "This business matches a do-not-contact record and was not queued for outreach.",
    };
  }
  if (cityKnown === false) {
    return {
      ...base,
      qualification: "not_qualified",
      confidence: "high",
      reason: "The recorded city is outside Carlsbad, Artesia, Loving, and the other Eddy County places this research covers.",
    };
  }
  if (!email) {
    return {
      ...base,
      qualification: "no_verified_contact",
      confidence: "medium",
      reason: "No public business email was on the record or the business page. An address was not guessed.",
    };
  }
  if (isPersonalEmail(email)) {
    return {
      ...base,
      qualification: "needs_review",
      confidence: "medium",
      reason: "The only public address uses a personal mailbox provider. Confirm it is a business inquiry address before any outreach.",
    };
  }
  if (input.robotsBlocked) {
    return {
      ...base,
      qualification: "needs_review",
      confidence: "low",
      reason: "The business website disallows automated reading. Review the public page manually before outreach.",
    };
  }
  if (input.fetchError) {
    return {
      ...base,
      qualification: "needs_review",
      confidence: "low",
      reason: input.fetchError,
    };
  }
  if (cityKnown === null) {
    return {
      ...base,
      qualification: "needs_review",
      confidence: "low",
      reason: "A public email is present, but the city was not confirmed inside Eddy County.",
    };
  }
  const websiteSentence = input.websiteHost
    ? `A public website was recorded at ${input.websiteHost}.`
    : "No website address was on the record, so none was researched.";
  return {
    ...base,
    qualification: "qualified",
    confidence: input.emailFromPage ? "medium" : "high",
    reason: `${input.businessName} is a ${industry || "local"} business in ${collapse(input.city)}. ${websiteSentence} A public business email was verified.`,
  };
}

export function buildDraft(input) {
  if (input.qualification !== "qualified" || !input.email) return null;
  const industry = input.industry ? `${input.industry} ` : "";
  const city = collapse(input.city) || "Eddy County";
  const websiteLine = input.websiteHost
    ? `The public website on file is ${input.websiteHost}.`
    : "A website address was not on the record I reviewed.";
  const address = collapse(input.mailingAddress);
  const subject = `Website help for ${collapse(input.businessName)}`.slice(0, 90);
  const body = [
    `Hello,`,
    ``,
    `I am with 4Ward Web Design, a web design company in Carlsbad. I am writing because ${collapse(input.businessName)} is a ${industry}business in ${city}. ${websiteLine}`,
    ``,
    `We build clear business websites and help with Google Business Profiles. Monthly plans start at $99. An optional admin dashboard is $50 per month, and there is a one-time $200 launch fee. Work samples are at ${PORTFOLIO_URL}.`,
    ``,
    `I am glad to offer a free consultation. Reply to this email, or call or text ${BUSINESS_PHONE}. Texting is welcome.`,
    ``,
    address || "Our mailing address will be added before this draft is sent.",
    `If you would rather not receive email from us, reply and ask to be removed.`,
  ].join("\n");
  return { subject, body: body.slice(0, 900) };
}

export function packResearchRecord(fields) {
  const qualification = QUALIFICATIONS.includes(fields.qualification) ? fields.qualification : "";
  const label = qualification ? QUALIFICATION_LABELS[qualification] : "";
  const summary = [label ? `Qualification: ${label}.` : "", collapse(fields.reason), collapse(fields.summary)]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
  const factual = collapse(fields.factualNotes);
  const draftBody = String(fields.draftBody || "").trim();
  const draftSubject = collapse(fields.draftSubject);
  let opportunities = factual;
  if (draftBody) {
    opportunities = [`Draft subject: ${draftSubject || "Website help"}`, "", draftBody, factual ? `\nNotes: ${factual}` : ""]
      .join("\n")
      .trim();
  }
  return {
    research_notes: summary,
    research_sources: String(fields.sources || "").trim().slice(0, 800),
    website_opportunities: opportunities.slice(0, 1000),
    gbp_observations: collapse(fields.listingNote).slice(0, 1000),
    research_confidence: fields.confidence || "",
    public_email: fields.email || "",
    industry: collapse(fields.industry).slice(0, 120),
    outreach_eligible: false,
  };
}

export function readResearchRecord(prospect) {
  const notes = String(prospect?.research_notes || "");
  const labelMatch = notes.match(/^Qualification:\s*([^.]+)\./);
  const label = labelMatch ? labelMatch[1].trim().toLowerCase() : "";
  const qualification = Object.entries(QUALIFICATION_LABELS).find(([, value]) => value.toLowerCase() === label)?.[0] || "";
  const reason = notes.replace(/^Qualification:\s*[^.]+\.\s*/, "").trim();
  const opportunities = String(prospect?.website_opportunities || "");
  const draftMatch = opportunities.match(/^Draft subject:\s*(.*)\n\n([\s\S]*?)(?:\nNotes:\s*([\s\S]*))?$/);
  return {
    qualification,
    reason: draftMatch ? reason : reason,
    summary: reason,
    draftSubject: draftMatch ? draftMatch[1].trim() : "",
    draftBody: draftMatch ? draftMatch[2].trim() : "",
    factualNotes: draftMatch ? String(draftMatch[3] || "").trim() : opportunities,
    sources: String(prospect?.research_sources || ""),
    listingNote: String(prospect?.gbp_observations || ""),
  };
}

export function listQualification(notes) {
  const match = String(notes || "").match(/^Qualification:\s*([^.]+)\./);
  return match ? match[1].trim() : "";
}

export function sourceLinks(value) {
  return String(value || "")
    .split(/\s+/)
    .filter((item) => /^https?:\/\//i.test(item))
    .slice(0, 8);
}

export function sameHost(left, right) {
  const first = parseWebsite(left);
  const second = parseWebsite(right);
  return Boolean(first && second && first.host === second.host);
}
