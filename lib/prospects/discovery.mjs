import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { WEEKDAY_TARGET } from "./model.mjs";
import { estimatedSendDates, isQueuePaused, isUncertainHold } from "./queue.mjs";
import { emailIdentity } from "./identity.mjs";
import { IMPORTED_CONTACT_NOTE, isOilfieldBusiness, newlyEstablishedEvidence, qualificationGapMessages } from "./research.mjs";

export const READY_FLOOR = 20;
export const READY_GOAL = 50;
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

export function prospectBlockMessage(row) {
  const email = emailOf(row);
  const status = String(row?.status || "");
  const messages = [];
  if (status === "sent" || row?.sent_at || row?.sentAt) messages.push("Already contacted. The sent record was not reset.");
  if (status === "do_not_contact" || status === "not_interested" || row?.suppressed) messages.push("This address is suppressed or opted out. It was not reactivated.");
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) messages.push("This one-time test address is excluded from future outreach.");
  if (isQueuePaused(row)) messages.push("An administrator paused this prospect. It stays out of the send.");
  if (isUncertainHold(row)) messages.push("Gmail's response was uncertain. This recipient is held for review and was not retried.");
  if (isAmbiguousHold(row)) messages.push("The business match is ambiguous. It was held for review and was not sent.");
  const findings = findingText(row);
  if (/(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(findings)) messages.push("The business is closed and is excluded from outreach.");
  messages.push(...qualificationGapMessages(row));
  return messages.join(" ");
}

function recordedBlock(row) {
  const email = emailOf(row);
  const status = String(row?.status || "");
  if (status === "sent" || row?.sent_at || row?.sentAt) return "already-contacted";
  if (status === "do_not_contact" || status === "not_interested" || row?.suppressed) return "opted-out";
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) return "one-time";
  const findings = findingText(row);
  if (/(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(findings)) return "closed";
  const gaps = qualificationGapMessages(row);
  if (gaps.includes("A company name is missing.")) return "name-missing";
  if (gaps.includes("An email address is missing.")) return "email-missing";
  if (gaps.includes("The email address is not valid.")) return "invalid-email";
  if (gaps.includes("A location is missing.")) return "location-missing";
  if (gaps.some((item) => item.startsWith("The recorded location"))) return "outside-area";
  return "";
}

/**
 * A public page can qualify a saved prospect. A failed or unread page stays pending.
 * This does not invent an email, a city, or a newly established date.
 */
export function findingFromReading(row, reading) {
  const email = emailOf(row);
  const visible = String(reading?.text || "");
  if (reading?.ok && /(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(visible)) {
    return { ready: false, reason: "The business is listed as closed on the page that was read." };
  }
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) {
    return { ready: false, reason: "This one-time test address is excluded from future outreach." };
  }
  const blocked = prospectBlockMessage(row);
  if (blocked) return { ready: false, reason: blocked };
  const found = (reading?.emails || []).map((item) => String(item).toLowerCase());
  const onPage = Boolean(reading?.ok && email && found.includes(email));
  const host = String(reading?.host || "").trim();
  const ownSite = Boolean(reading?.ownSite && host);
  const established = reading?.ok ? newlyEstablishedEvidence(visible) : "";
  return {
    ready: true,
    city: row?.city || "",
    websiteHost: ownSite ? host : String(row?.website_host || row?.websiteHost || ""),
    websiteUrl: ownSite ? String(reading?.sourceUrl || "") : String(row?.website_url || row?.websiteUrl || ""),
    reason: onPage
      ? [
        "Not listed as closed on the pages that were read.",
        `Published email ${email} was on a page that was read.`,
        ownSite ? `A business-owned website is recorded at ${host}.` : WEBSITE_CHECK_NOTE,
        established ? `Newly established: ${established}` : "",
      ].filter(Boolean).join(" ")
      : IMPORTED_CONTACT_NOTE,
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

/** Recheck a Ready record before it can be sent. Age and a saved website do not block it. */
export function readinessBlock(row) {
  if (isQueuePaused(row)) return "paused";
  if (isUncertainHold(row)) return "uncertain";
  if (isAmbiguousHold(row)) return "ambiguous";
  if (String(row?.status || "") !== "ready" || row?.outreach_eligible === false || row?.outreachEligible === false) return "not-ready";
  return recordedBlock(row);
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
