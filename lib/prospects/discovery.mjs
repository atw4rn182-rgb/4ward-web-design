import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { WEEKDAY_TARGET } from "./model.mjs";
import { estimatedSendDates, isQueuePaused, isUncertainHold } from "./queue.mjs";
import { emailIdentity } from "./identity.mjs";
import { inSoutheasternNewMexico, isPersonalEmail, isPublishableEmail } from "./research.mjs";

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

function recordedBlock(row) {
  const email = emailOf(row);
  const status = String(row?.status || "");
  if (status === "sent" || row?.sent_at || row?.sentAt) return "already-contacted";
  if (status === "do_not_contact" || status === "not_interested" || row?.suppressed) return "opted-out";
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) return "one-time";
  const closedText = [row?.notes, row?.research_notes, row?.researchNotes, row?.gbp_observations].filter(Boolean).join(" ");
  if (/permanently closed|business is closed|listed as closed/i.test(closedText)) return "closed";
  if (inSoutheasternNewMexico(row?.city, row?.service_area || row?.serviceArea) !== true) return "outside-area";
  const publishedNotes = [row?.notes, row?.research_notes, row?.researchNotes].filter(Boolean).join(" ");
  if (!isPublishableEmail(email)) return "email";
  if (isPersonalEmail(email) && !/published as a business contact/i.test(publishedNotes)) return "email";
  const source = String(row?.research_sources || row?.researchSources || "");
  if (!/https?:\/\//i.test(source)) return "no-source";
  if (String(row?.website_host || row?.websiteHost || "").trim()) return "has-website";
  const findings = [row?.research_notes, row?.researchNotes].filter(Boolean).join(" ");
  if (!findings.includes(WEBSITE_CHECK_NOTE)) return "website-not-checked";
  const mentioned = String(row?.research_notes || row?.researchNotes || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (mentioned.length && !mentioned.some((item) => item.toLowerCase() === email)) return "conflicting";
  return "";
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
  const dates = estimatedSendDates(eligible.length, now, sentToday);
  eligible.forEach((row, index) => {
    notes.set(row.id, { queuePosition: index + 1, sendAt: dates[index] || "", skipReason: "" });
  });
  return notes;
}

export function upcomingRecipients(rows, now = new Date(), limit = WEEKDAY_TARGET) {
  const chosen = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (chosen.length >= limit) break;
    const email = emailOf(row);
    if (!email || seen.has(email) || readinessBlock(row, now)) continue;
    seen.add(email);
    chosen.push(row);
  }
  return chosen;
}
