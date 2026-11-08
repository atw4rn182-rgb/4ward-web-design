import { collapse, findSuppression, parseWebsite, sameBusiness, sortProspects } from "./model.mjs";

export const RESEARCH_BATCH_LIMIT = 5;
export const RESEARCH_DEADLINE_MS = 8000;
export const RESEARCH_FAILURE_LIMIT = 2;
export const PORTFOLIO_URL = "https://www.4wardwebdesign.com";
export const OFFER_LINKS = [
  ["Southeastern New Mexico — 10% off the first month", `${PORTFOLIO_URL}/?offer=local#pricing`],
  ["Military or first responder — 20% off the first month", `${PORTFOLIO_URL}/?offer=service#pricing`],
  ["Both offers — 30% off the first month", `${PORTFOLIO_URL}/?offer=both#pricing`],
];
export const BUSINESS_PHONE = "(970) 560-2575";
export const BUSINESS_EMAIL = "4wardwebdesigns@gmail.com";
export const BUSINESS_OWNER = "Adam Windhorst";
export const COMMERCIAL_URL = "https://www.4wardwebdesign.com/assets/4ward-commercial.mp4";
/** USPS Publication 28 uses "PO BOX" plus the box number. The post office street is not part of this address. */
export const BUSINESS_POSTAL_ADDRESS = "4Ward Web Design\nPO BOX 1161\nCARLSBAD NM 88220";
export const DRAFT_BODY_LIMIT = 2000;

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

const LEA_PLACES = ["hobbs", "lovington", "eunice", "jal", "tatum", "monument"];

const NEW_MEXICO_PLACES = [
  ...EDDY_PLACES,
  ...LEA_PLACES,
  "roswell",
  "hagerman",
  "dexter",
  "lake arthur",
  "alamogordo",
  "tularosa",
  "la luz",
  "cloudcroft",
  "mayhill",
  "ruidoso",
  "ruidoso downs",
  "capitan",
  "carrizozo",
  "alto",
  "las cruces",
  "mesilla",
  "hatch",
  "anthony",
  "sunland park",
  "albuquerque",
  "rio rancho",
  "corrales",
  "bernalillo",
  "los lunas",
  "bosque farms",
  "belen",
  "cedar crest",
  "tijeras",
  "edgewood",
  "moriarty",
  "santa fe",
  "espanola",
  "farmington",
  "bloomfield",
  "aztec",
  "shiprock",
  "kirtland",
  "clovis",
  "portales",
  "gallup",
  "silver city",
  "deming",
  "lordsburg",
  "socorro",
  "truth or consequences",
  "taos",
  "raton",
  "las vegas",
  "santa rosa",
  "tucumcari",
  "chaparral",
];

const WEST_TEXAS_PLACES = [
  "el paso",
  "horizon city",
  "canutillo",
  "san elizario",
  "fabens",
  "van horn",
  "sierra blanca",
  "fort davis",
  "marfa",
  "terlingua",
  "study butte",
  "presidio",
  "fort stockton",
  "pecos",
  "balmorhea",
  "mentone",
  "monahans",
  "kermit",
  "wink",
  "odessa",
  "midland",
  "big spring",
  "seminole",
  "denver city",
  "seagraves",
  "brownfield",
  "levelland",
  "lubbock",
  "slaton",
  "lamesa",
  "odonnell",
  "snyder",
  "colorado city",
  "san angelo",
  "big lake",
  "mccamey",
  "ozona",
  "iraan",
  "sheffield",
  "sanderson",
  "del rio",
  "abilene",
  "amarillo",
  "hereford",
  "plainview",
  "muleshoe",
  "littlefield",
  "dumas",
  "borger",
  "pampa",
  "childress",
  "tulia",
  "friona",
  "dimmitt",
  "alpine",
  "andrews",
];

const WEST_TEXAS_WITH_STATE = ["post", "crane", "canyon", "marathon", "plains", "garden city"];

export const IMPORTED_CONTACT_NOTE = "Imported business contact. The email was not independently verified.";

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
      cost: "Text Search Enterprise, which includes the website field, is $35 per 1,000 after 1,000 free requests a month. It does not return email addresses. Not enabled.",
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
      "Automatic discovery is not active. No research service is connected for New Mexico business lookup. Add a business manually, then research that record. Nothing is invented.",
  };
}

export function inEddyCounty(city, serviceArea) {
  const recorded = collapse(`${city || ""} ${serviceArea || ""}`).toLowerCase();
  if (!recorded) return null;
  return EDDY_PLACES.some((place) => recorded.includes(place));
}

export function inSoutheasternNewMexico(city, serviceArea) {
  const recorded = collapse(`${city || ""} ${serviceArea || ""}`).toLowerCase();
  if (!recorded) return null;
  return EDDY_PLACES.concat(LEA_PLACES).some((place) => recorded.includes(place));
}

function placePattern(place) {
  return new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\b`, "i");
}

export function servicePlacesIn(text) {
  const source = String(text || "");
  return NEW_MEXICO_PLACES.filter((place) => placePattern(place).test(source));
}

export function inNewMexico(city, serviceArea) {
  const recorded = collapse(`${city || ""} ${serviceArea || ""}`);
  if (!recorded) return null;
  if (/\bnew mexico\b/i.test(recorded)) return true;
  return servicePlacesIn(recorded).length > 0;
}

export function inWestTexas(city, serviceArea) {
  const recorded = collapse(`${city || ""} ${serviceArea || ""}`);
  if (!recorded) return null;
  if (/\bwest texas\b/i.test(recorded)) return true;
  if (WEST_TEXAS_PLACES.some((place) => placePattern(place).test(recorded))) return true;
  return /\btexas\b/i.test(recorded) && WEST_TEXAS_WITH_STATE.some((place) => placePattern(place).test(recorded));
}

/** Blank location is null. New Mexico and West Texas are true. Any other saved place is false. */
export function inOutreachArea(city, serviceArea) {
  const recorded = collapse(`${city || ""} ${serviceArea || ""}`);
  if (!recorded) return null;
  return inNewMexico(city, serviceArea) === true || inWestTexas(city, serviceArea) === true;
}

export function qualificationGapMessages(input = {}) {
  const messages = [];
  const name = collapse(input.businessName || input.business_name || "");
  if (!name) messages.push("A company name is missing.");
  const email = String(input.publicEmail || input.public_email || "").trim();
  if (!email) messages.push("An email address is missing.");
  else if (!isPublishableEmail(email)) messages.push("The email address is not valid.");
  const area = inOutreachArea(input.city, input.serviceArea || input.service_area);
  if (area === null) messages.push("A location is missing.");
  else if (area === false) messages.push("The recorded location is outside New Mexico and West Texas.");
  return messages;
}

/** A saved New Mexico city must appear on the page. Outside southeastern New Mexico, the page must also say New Mexico. */
export function pageConfirmsServiceArea(pageText, city, serviceArea) {
  const recorded = servicePlacesIn(`${city || ""} ${serviceArea || ""}`);
  const found = servicePlacesIn(pageText);
  const mentionsState = /\bNew Mexico\b|\bNM\b/i.test(String(pageText || ""));
  const southeast = new Set(EDDY_PLACES.concat(LEA_PLACES));
  if (recorded.length) {
    const overlap = recorded.filter((place) => found.includes(place));
    if (!overlap.length) return false;
    if (mentionsState || overlap.some((place) => southeast.has(place))) return true;
    return false;
  }
  if (!mentionsState) return "";
  const named = found.find((place) => place.length >= 5);
  return named ? named.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

export function industryHint(name) {
  const text = collapse(name).toLowerCase();
  const match = INDUSTRY_HINTS.find(([needle]) => text.includes(needle));
  return match ? match[1] : "";
}

/** Evidence must be written on a page that was read. The business name alone is not evidence. */
export function newlyEstablishedEvidence(text) {
  const source = String(text || "").replace(/<[^>]+>/g, " ");
  const match = source.match(/(?:newly established|grand opening|established|founded|opened)[^.]{0,80}20(?:2[4-9]|3[0-9])/i)
    || source.match(/20(?:2[4-9]|3[0-9])[^.]{0,40}(?:newly established|grand opening|established|founded|opened)/i);
  return match ? collapse(match[0]).slice(0, 160) : "";
}

export function isOilfieldBusiness(row) {
  const text = `${row?.business_name || row?.businessName || ""} ${row?.industry || ""}`.toLowerCase();
  return /oil\s*field|oilfield|welding|fabrication|\bweld|roustabout|wireline|workover|flowback|hydrovac|well service/.test(text);
}

export function websiteOfferStatus({ websiteHost, websiteLine, researchNotes } = {}) {
  if (String(websiteHost || "").trim()) return "recorded";
  const notes = `${websiteLine || ""} ${researchNotes || ""}`;
  if (/did not show a business-owned website|no business-owned website found/i.test(notes)) return "absent";
  return "uncertain";
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
  const gaps = qualificationGapMessages({ ...input, publicEmail: email });
  if (gaps.length) {
    const outsideOnly = gaps.length === 1 && gaps[0].startsWith("The recorded location");
    const invalidOnly = gaps.length === 1 && gaps[0] === "The email address is not valid.";
    const emailOnly = gaps.length === 1 && gaps[0] === "An email address is missing.";
    return {
      ...base,
      qualification: outsideOnly || invalidOnly ? "not_qualified" : emailOnly ? "no_verified_contact" : "needs_review",
      confidence: "high",
      reason: gaps.join(" "),
    };
  }
  const websiteSentence = input.websiteHost
    ? `A public website was recorded at ${input.websiteHost}.`
    : "No website address was on the record, so none was researched.";
  const contactSentence = input.emailFromPage
    ? "The email was on a page that was read."
    : IMPORTED_CONTACT_NOTE;
  return {
    ...base,
    qualification: "qualified",
    confidence: input.emailFromPage ? "medium" : "high",
    reason: `${input.businessName} is a ${industry || "local"} business in ${collapse(input.city)}. ${websiteSentence} ${contactSentence}`,
  };
}

export function buildDraft(input) {
  if (input.qualification !== "qualified" || !input.email) return null;
  const industry = input.industry ? `${input.industry} ` : "";
  const city = collapse(input.city) || "Eddy County";
  const status = websiteOfferStatus(input);
  const websiteLine = String(input.websiteLine || "").trim() || (
    status === "recorded"
      ? `A business-owned website is on file at ${input.websiteHost}.`
      : status === "absent"
        ? "The pages I checked did not show a business-owned website."
        : "I could not confirm whether a business-owned website is already in use."
  );
  const offer = status === "recorded"
    ? "I can help improve that website and make the business easier to find on Google Search and Maps. That includes Google Business Profile setup and optimization, and making it easier for customers to contact the business and request a quote."
    : status === "absent"
      ? "I can build a professional website and help the business show up on Google Search and Maps. That includes Google Business Profile setup and optimization, and making it easier for customers to contact the business and request a quote."
      : "I can help with website design, improvements to an existing site, and visibility on Google Search and Maps. That includes Google Business Profile setup and optimization, and making it easier for customers to contact the business and request a quote.";
  const address = String(input.mailingAddress || "").trim() || BUSINESS_POSTAL_ADDRESS;
  const subject = `Website help for ${collapse(input.businessName)}`.slice(0, 90);
  const body = [
    `Hello,`,
    ``,
    `My name is ${BUSINESS_OWNER}, and I own 4Ward Web Design. I am writing because ${collapse(input.businessName)} is a ${industry}business in ${city}. ${websiteLine}`,
    ``,
    offer,
    ``,
    `New subscriptions include two first-month offers. A business with a southeastern New Mexico address saves 10% on the first month. A military member or first responder who lists a branch or service saves 20% on the first month. Eligible customers can use both, for 30% off the first month. The regular monthly price returns after that. The $200 launch fee stays $200 and is nonrefundable. The first monthly payment can be refunded within 14 days if you change your mind.`,
    ``,
    ...OFFER_LINKS.flatMap(([label, url]) => [`${label}:`, url, ``]),
    `I would like to offer a free, no-obligation consultation. Reply to this email, or call or text ${BUSINESS_PHONE}. Texting is welcome.`,
    ``,
    `View Our Website: ${PORTFOLIO_URL}`,
    `Watch Our Commercial: ${COMMERCIAL_URL}`,
    ``,
    BUSINESS_OWNER,
    `4Ward Web Design`,
    BUSINESS_EMAIL,
    BUSINESS_PHONE,
    PORTFOLIO_URL,
    ``,
    address,
    ``,
    `If you would rather not receive email from us, reply and ask to be removed.`,
  ].join("\n");
  return { subject, body: body.slice(0, DRAFT_BODY_LIMIT) };
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
    website_opportunities: opportunities.slice(0, 2400),
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
