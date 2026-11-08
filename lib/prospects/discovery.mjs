import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { WEEKDAY_TARGET } from "./model.mjs";
import { inSoutheasternNewMexico, isPersonalEmail, isPublishableEmail } from "./research.mjs";

export const READY_FLOOR = 20;
export const READY_GOAL = 50;
export const RESEARCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ONE_TIME_EMAIL = "nereecerodriguez956@gmail.com";
export const LOOKUP_BLOCKER = "Discovery is not active. No research service is connected that returns published southeastern New Mexico business emails. OpenStreetMap's public server is not used for commercial lookup, and Google Places is not enabled. No business or email was invented.";

export function discoveryNeed(readyCount) {
  const ready = Math.max(0, Number(readyCount) || 0);
  if (ready >= READY_FLOOR) return 0;
  return Math.max(0, READY_GOAL - ready);
}

export function deliveryShortfall(alreadySent, submitted) {
  return Math.max(0, WEEKDAY_TARGET - Math.max(0, Number(alreadySent) || 0) - Math.max(0, Number(submitted) || 0));
}

function emailOf(row) {
  return String(row?.public_email || row?.publicEmail || "").trim().toLowerCase();
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
  if (!isPublishableEmail(email) || isPersonalEmail(email)) return "email";
  const source = String(row?.research_sources || row?.researchSources || "");
  if (!/https?:\/\//i.test(source)) return "no-source";
  if (String(row?.website_host || row?.websiteHost || "").trim()) return "has-website";
  const mentioned = String(row?.research_notes || row?.researchNotes || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (mentioned.length && !mentioned.some((item) => item.toLowerCase() === email)) return "conflicting";
  return "";
}

/** A saved pending record can become Ready only from facts already on the record. */
export function verificationBlock(row) {
  const status = String(row?.status || "");
  if (status !== "queued" && status !== "researching") return "not-pending";
  return recordedBlock(row);
}

/** Recheck a Ready record before it can be sent. */
export function readinessBlock(row, now = new Date()) {
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
