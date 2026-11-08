import { WEEKDAY_TARGET, nextScheduledRun, sameDenverDay } from "./model.mjs";

export const QUEUE_PAUSE_NOTE = "Queue paused by an administrator.";
export const UNCERTAIN_HOLD_NOTE = "Held for review. Gmail's response was uncertain. The message was not sent again.";

export function isQueuePaused(row) {
  return new RegExp(QUEUE_PAUSE_NOTE.replace(/[.]/g, "\\."), "i").test(String(row?.notes || ""));
}

export function isUncertainHold(row) {
  const text = [row?.notes, row?.research_notes, row?.researchNotes].filter(Boolean).join(" ");
  return /held for review|response was uncertain/i.test(text);
}

/** Times start after every prospect already in the queue. Order inside the batch follows the paste. */
export function assignQueueTimes(anchor, count) {
  const start = new Date(anchor || 0).getTime();
  const base = Number.isNaN(start) ? Date.now() : start;
  const total = Math.max(0, Number(count) || 0);
  const times = [];
  for (let index = 0; index < total; index += 1) {
    times.push(new Date(base + (index + 1) * 1000).toISOString());
  }
  return times;
}

/**
 * One worker records the run only when last_run_at still matches the value it read.
 * A second worker sees the new value and does not send.
 */
export function compareAndSetRun(row, expected, next) {
  const stored = row?.last_run_at || null;
  const seen = expected || null;
  if (stored !== seen) return { ok: false, row };
  return { ok: true, row: { ...row, last_run_at: next } };
}

/** An uncertain Gmail response ends the run. Later prospects do not fill that slot. */
export function slotsAfterAttempt(state, attempt) {
  const next = {
    sent: state?.sent || 0,
    failed: state?.failed || 0,
    uncertain: state?.uncertain || 0,
    stopped: Boolean(state?.stopped),
  };
  if (next.stopped) return next;
  if (attempt?.duplicate) return next;
  if (attempt?.uncertain || attempt?.stopped) {
    if (attempt?.uncertain) next.uncertain += 1;
    next.stopped = true;
    return next;
  }
  if (attempt?.ok) next.sent += 1;
  else next.failed += 1;
  return next;
}

export function estimatedSendDates(count, now = new Date(), sentToday = 0) {
  const dates = [];
  const total = Math.max(0, Number(count) || 0);
  let cursor = nextScheduledRun(now);
  let first = true;
  while (cursor && dates.length < total) {
    let slots = WEEKDAY_TARGET;
    if (first && sameDenverDay(cursor, now)) {
      slots = Math.max(0, WEEKDAY_TARGET - Math.max(0, Number(sentToday) || 0));
    }
    first = false;
    for (let index = 0; index < slots && dates.length < total; index += 1) {
      dates.push(cursor.toISOString());
    }
    cursor = nextScheduledRun(new Date(cursor.getTime() + 60 * 1000));
  }
  return dates;
}

export function needsMoreVerified(readyCount) {
  return Math.max(0, Number(readyCount) || 0) < WEEKDAY_TARGET;
}

export function skipExplanation(reason) {
  const messages = {
    "already-contacted": "Already contacted. The sent record was not reset.",
    uncertain: "Gmail's response was uncertain. This recipient is held for review and was not retried.",
    paused: "An administrator paused this prospect. It stays out of the send.",
    closed: "The business is closed and is excluded from outreach.",
    "one-time": "This one-time test address is excluded from future outreach.",
    "not-eligible": "This prospect is not eligible to email.",
    "not-ready": "This prospect is not Ready.",
    email: "A published business email is not confirmed. It stays Pending research.",
    "personal-email": "The address uses a personal domain and is not confirmed as a published business contact.",
    "outside-area": "Location is missing or outside New Mexico. It stays Pending research.",
    "no-source": "A source URL was not saved. It stays Pending research.",
    "operating-not-checked": "Operating status was not confirmed from a page that was read. It stays Pending research.",
    "website-not-checked": "Public pages have not been checked for a business-owned website.",
    conflicting: "The research notes mention a different email.",
    stale: "The research is older than 30 days.",
    "opted-out": "This address is suppressed or opted out. It was not reactivated.",
    "existing-customer": "This email belongs to an existing customer.",
    duplicate: "This matches a business or email already saved. A different email was not sent.",
    ambiguous: "The business match is ambiguous. It was held for review and was not sent.",
    refused: "Gmail refused this recipient. It was not retried automatically.",
    "not-pending": "This record is not waiting for research.",
    "invalid-email": "The email format is not valid.",
  };
  return messages[reason] || "This prospect was not sent.";
}
