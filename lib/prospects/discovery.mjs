import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { WEEKDAY_TARGET } from "./model.mjs";
import { estimatedSendDates, isQueuePaused, isUncertainHold } from "./queue.mjs";
import { emailIdentity } from "./identity.mjs";
import { inSoutheasternNewMexico, isOilfieldBusiness, isPublishableEmail, newlyEstablishedEvidence, pageConfirmsServiceArea, servicePlacesIn } from "./research.mjs";

export const READY_FLOOR = 20;
export const READY_GOAL = 50;
export const RESEARCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ONE_TIME_EMAIL = "nereecerodriguez956@gmail.com";
export const WEBSITE_CHECK_NOTE = "Checked public pages did not show a business-owned website.";
export const LOOKUP_BLOCKER = "Discovery is not active. No end-to-end discovery run has succeeded. GOOGLE_PLACES_API_KEY is not connected, so no business lookup was run and no email was guessed.";

export function discoveryNeed(readyCount) {
  const ready = Math.max(0, Number(readyCount) || 0);
  if (ready >= READY_FLOOR) return 0;
  return Math.max(0, READY_GOAL - ready);
}

export function deliveryShortfall(alreadySent, submitted) {
  return Math.max(0, WEEKDAY_TARGET - Math.max(0, Number(alreadySent) || 0) - Math.max(0, Number(submitted) || 0));
}

function emailOf(row) {
  return emailIdentity(row?.public_email || row?.publicEmail || "").normalized;
}

function findingText(row) {
  return [row?.notes, row?.research_notes, row?.researchNotes, row?.gbp_observations].filter(Boolean).join(" ");
}

function publishedOnRecord(row, email) {
  const notes = findingText(row);
  if (!email || !notes.toLowerCase().includes(email)) return false;
  return /published as a business contact|was on a page that was read/i.test(notes);
}

function recordedBlock(row) {
  const email = emailOf(row);
  const status = String(row?.status || "");
  if (status === "sent" || row?.sent_at || row?.sentAt) return "already-contacted";
  if (status === "do_not_contact" || status === "not_interested" || row?.suppressed) return "opted-out";
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) return "one-time";
  const findings = findingText(row);
  if (/(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(findings)) return "closed";
  if (inSoutheasternNewMexico(row?.city, row?.service_area || row?.serviceArea) !== true) return "outside-area";
  if (!isPublishableEmail(email)) return "email";
  const mentioned = findings.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (mentioned.length && !mentioned.some((item) => item.toLowerCase() === email)) return "conflicting";
  if (!publishedOnRecord(row, email)) return "email";
  const source = String(row?.research_sources || row?.researchSources || row?.website_url || row?.websiteUrl || "");
  if (!/https?:\/\//i.test(source) && !String(row?.website_host || row?.websiteHost || "").trim()) return "no-source";
  if (!/not listed as closed on the pages that were read|listed as operating/i.test(findings)) return "operating-not-checked";
  return "";
}

/**
 * A public page can qualify a saved prospect. A failed or unread page stays pending.
 * This does not invent an email, a city, or a newly established date.
 */
export function findingFromReading(row, reading) {
  if (!reading?.ok) {
    return { ready: false, reason: reading?.error || "The public page could not be read. Nothing was marked Ready." };
  }
  const visible = String(reading.text || "");
  if (/(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(visible)) {
    return { ready: false, reason: "The business is listed as closed on the page that was read." };
  }
  const email = emailOf(row);
  const found = (reading.emails || []).map((item) => String(item).toLowerCase());
  if (!email || !found.includes(email)) {
    return { ready: false, reason: "The saved email was not on the page that was read. An address was not guessed." };
  }
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) {
    return { ready: false, reason: "This one-time test address is excluded from future outreach." };
  }
  if (row?.city && inSoutheasternNewMexico(row.city, row?.service_area || row?.serviceArea) !== true) {
    return { ready: false, reason: "The recorded city is outside southeastern New Mexico." };
  }
  const recordedPlaces = servicePlacesIn(`${row?.city || ""} ${row?.service_area || row?.serviceArea || ""}`);
  const pagePlaces = servicePlacesIn(visible);
  if (recordedPlaces.length && pagePlaces.length && !recordedPlaces.some((place) => pagePlaces.includes(place))) {
    return { ready: false, reason: `The page names ${pagePlaces[0]} and the saved city is ${row.city}. The location conflicts, so it stays Pending.` };
  }
  const confirmedArea = pageConfirmsServiceArea(visible, row?.city, row?.service_area || row?.serviceArea);
  if (confirmedArea === false || confirmedArea === "") {
    return { ready: false, reason: "The page that was read did not confirm a southeastern New Mexico location." };
  }
  const established = newlyEstablishedEvidence(visible);
  const host = String(reading.host || "").trim();
  const ownSite = Boolean(reading.ownSite && host);
  return {
    ready: true,
    city: row?.city || (confirmedArea === true ? "" : confirmedArea),
    websiteHost: ownSite ? host : "",
    websiteUrl: ownSite ? String(reading.sourceUrl || "") : "",
    reason: [
      "Not listed as closed on the pages that were read.",
      `Published email ${email} was on a page that was read.`,
      ownSite ? `A business-owned website is recorded at ${host}.` : WEBSITE_CHECK_NOTE,
      established ? `Newly established: ${established}` : "",
    ].filter(Boolean).join(" "),
  };
}

export function outreachRank(row) {
  const notes = findingText(row);
  const established = /newly established:/i.test(notes);
  const noSite = !String(row?.website_host || row?.websiteHost || "").trim() && notes.includes(WEBSITE_CHECK_NOTE);
  const oilfield = isOilfieldBusiness(row);
  if (established && noSite && oilfield) return 0;
  if (established && noSite) return 1;
  if (noSite && oilfield) return 2;
  if (noSite) return 3;
  if (oilfield) return 4;
  return 5;
}

export function sortOutreachQueue(rows) {
  return [...(rows || [])].sort((left, right) => {
    const rank = outreachRank(left) - outreachRank(right);
    if (rank) return rank;
    const leftAt = Date.parse(left?.queued_at || left?.queuedAt || left?.created_at || left?.createdAt || 0) || 0;
    const rightAt = Date.parse(right?.queued_at || right?.queuedAt || right?.created_at || right?.createdAt || 0) || 0;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
}

/** A saved pending record can become Ready only from facts already on the record. */
export function isAmbiguousHold(row) {
  return /needs review before another introduction/i.test([row?.notes, row?.research_notes, row?.researchNotes].filter(Boolean).join(" "));
}

export function verificationBlock(row) {
  if (isQueuePaused(row)) return "paused";
  if (isUncertainHold(row)) return "uncertain";
  if (isAmbiguousHold(row)) return "ambiguous";
  const status = String(row?.status || "");
  if (status !== "queued" && status !== "researching") return "not-pending";
  return recordedBlock(row);
}

/** Recheck a Ready record before it can be sent. */
export function readinessBlock(row, now = new Date()) {
  if (isQueuePaused(row)) return "paused";
  if (isUncertainHold(row)) return "uncertain";
  if (isAmbiguousHold(row)) return "ambiguous";
  if (String(row?.status || "") !== "ready" || row?.outreach_eligible === false || row?.outreachEligible === false) return "not-ready";
  const blocked = recordedBlock(row);
  if (blocked) return blocked;
  const hasStamp = Object.prototype.hasOwnProperty.call(row || {}, "researched_at") || Object.prototype.hasOwnProperty.call(row || {}, "researchedAt");
  if (!hasStamp) return "";
  const stamp = row?.researched_at || row?.researchedAt;
  const at = stamp ? new Date(stamp).getTime() : 0;
  if (!at || Number.isNaN(at) || now.getTime() - at > RESEARCH_MAX_AGE_MS) return "stale";
  return "";
}

export function selectPendingForReview(rows, need) {
  const limit = Math.max(0, Number(need) || 0);
  const chosen = [];
  const skipped = [];
  const seenEmails = new Set();
  const seenNames = new Set();
  for (const row of rows || []) {
    const reason = verificationBlock(row);
    const email = emailOf(row);
    const name = `${String(row?.business_name || "").trim().toLowerCase()}|${String(row?.city || "").trim().toLowerCase()}`;
    const duplicate = (email && seenEmails.has(email)) || seenNames.has(name);
    if (reason || duplicate) {
      skipped.push({ id: row?.id, reason: reason || "duplicate" });
      continue;
    }
    seenEmails.add(email);
    seenNames.add(name);
    if (chosen.length >= limit) continue;
    chosen.push(row);
  }
  return { chosen, skipped };
}

export function annotateReadyQueue(rows, now = new Date(), sentToday = 0) {
  const notes = new Map();
  const eligible = [];
  for (const row of rows || []) {
    const reason = readinessBlock(row, now);
    if (reason) notes.set(row.id, { queuePosition: null, sendAt: "", skipReason: reason });
    else eligible.push(row);
  }
  const ordered = sortOutreachQueue(eligible);
  const dates = estimatedSendDates(ordered.length, now, sentToday);
  ordered.forEach((row, index) => {
    notes.set(row.id, { queuePosition: index + 1, sendAt: dates[index] || "", skipReason: "" });
  });
  return notes;
}

export function upcomingRecipients(rows, now = new Date(), limit = WEEKDAY_TARGET) {
  const chosen = [];
  const seen = new Set();
  for (const row of sortOutreachQueue(rows)) {
    if (chosen.length >= limit) break;
    const email = emailOf(row);
    if (!email || seen.has(email) || readinessBlock(row, now)) continue;
    seen.add(email);
    chosen.push(row);
  }
  return chosen;
}
