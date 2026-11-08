import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { WEEKDAY_TARGET } from "./model.mjs";
import { inSoutheasternNewMexico, isPersonalEmail, isPublishableEmail } from "./research.mjs";

export const READY_TARGET = WEEKDAY_TARGET;
export const ONE_TIME_EMAIL = "nereecerodriguez956@gmail.com";
export const LOOKUP_BLOCKER = "No permitted lookup source publishes business emails. OpenStreetMap's public server is not used for commercial lookup, and Google Places is not enabled. No business or email was invented.";

export function discoveryNeed(readyCount) {
  return Math.max(0, READY_TARGET - Math.max(0, Number(readyCount) || 0));
}

export function deliveryShortfall(alreadySent, submitted) {
  return Math.max(0, READY_TARGET - Math.max(0, Number(alreadySent) || 0) - Math.max(0, Number(submitted) || 0));
}

/** A saved pending record can become Ready only from facts already on the record. */
export function verificationBlock(row) {
  const email = String(row?.public_email || row?.publicEmail || "").trim().toLowerCase();
  const status = String(row?.status || "");
  if (status === "sent" || row?.sent_at || row?.sentAt) return "already-contacted";
  if (status === "do_not_contact" || status === "not_interested" || row?.suppressed) return "opted-out";
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) return "one-time";
  const closedText = [row?.notes, row?.research_notes, row?.researchNotes, row?.gbp_observations].filter(Boolean).join(" ");
  if (/permanently closed|business is closed|listed as closed/i.test(closedText)) return "closed";
  if (status !== "queued" && status !== "researching") return "not-pending";
  if (inSoutheasternNewMexico(row?.city, row?.service_area || row?.serviceArea) !== true) return "outside-area";
  if (!isPublishableEmail(email) || isPersonalEmail(email)) return "email";
  const source = String(row?.research_sources || row?.researchSources || "");
  if (!/https?:\/\//i.test(source)) return "no-source";
  if (String(row?.website_host || row?.websiteHost || "").trim()) return "has-website";
  return "";
}

export function selectPendingForReview(rows, need) {
  const limit = Math.max(0, Number(need) || 0);
  const chosen = [];
  const skipped = [];
  for (const row of rows || []) {
    const reason = verificationBlock(row);
    if (reason) {
      skipped.push({ id: row?.id, reason });
      continue;
    }
    if (chosen.length >= limit) continue;
    chosen.push(row);
  }
  return { chosen, skipped };
}
