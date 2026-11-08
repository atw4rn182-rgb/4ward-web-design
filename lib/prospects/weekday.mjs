import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { findRecipientMatch, phoneDigits, businessDomain } from "./identity.mjs";
import { WEEKDAY_TARGET, canSubmitOutreach } from "./model.mjs";
import { isQueuePaused, isUncertainHold } from "./queue.mjs";
import { isPersonalEmail, isPublishableEmail } from "./research.mjs";

export function isClosedProspect(row) {
  const text = [row?.notes, row?.research_notes, row?.researchNotes, row?.gbp_observations].filter(Boolean).join(" ");
  return /permanently closed|business is closed|listed as closed/i.test(text);
}

function emailOf(row) {
  return String(row?.public_email || row?.publicEmail || row?.email || "").trim().toLowerCase();
}

/**
 * Picks new eligible businesses for one weekday run.
 * Personal mailboxes, closed businesses, one-time tests, opt-outs,
 * customers, and duplicates are left out. Uncertain sends are not replaced.
 */
export function selectWeekdayRecipients(rows, options = {}) {
  const limit = Math.max(0, Number(options.limit) || 0);
  const suppressed = new Set((options.suppressedEmails || []).map((email) => String(email).toLowerCase()));
  const customers = new Set((options.customerEmails || []).map((email) => String(email).toLowerCase()));
  const uncertain = new Set(options.uncertainIds || []);
  const refused = new Set(options.refusedIds || []);
  const chosen = [];
  const skipped = [];
  const seen = new Set();
  const records = [...(options.records || [])];
  for (const row of rows || []) {
    const email = emailOf(row);
    const reason = weekdaySkipReason(row, { email, suppressed, customers, uncertain, refused, seen, records });
    if (reason) {
      skipped.push({ id: row.id, reason, matchId: "" });
      continue;
    }
    if (chosen.length >= limit) continue;
    chosen.push(row);
    seen.add(email);
    records.push({
      source: "prospect",
      id: row.id,
      name: row.business_name,
      city: row.city,
      email,
      phone: phoneDigits(row.notes || ""),
      websiteHost: businessDomain(row.website_host || ""),
      status: row.status,
    });
  }
  return { chosen, skipped };
}

function weekdaySkipReason(row, { email, suppressed, customers, uncertain, refused, seen, records }) {
  if (row?.status === "sent" || row?.sent_at || row?.sentAt) return "already-contacted";
  if (uncertain.has(row?.id) || isUncertainHold(row)) return "uncertain";
  if (isQueuePaused(row)) return "paused";
  if (refused.has(row?.id)) return "refused";
  if (row?.status === "do_not_contact" || row?.status === "not_interested" || row?.suppressed) return "opted-out";
  if (isOneTimeOutreach(row?.notes)) return "one-time";
  if (isClosedProspect(row)) return "closed";
  if (!row?.outreach_eligible && row?.outreachEligible !== true) return "not-eligible";
  if (row?.status !== "ready") return "not-ready";
  if (!isPublishableEmail(email)) return "invalid-email";
  if (isPersonalEmail(email)) return "personal-email";
  if (suppressed.has(email)) return "opted-out";
  if (customers.has(email)) return "existing-customer";
  if (seen.has(email)) return "duplicate";
  const match = findRecipientMatch({
    name: row?.business_name,
    city: row?.city,
    email,
    phone: phoneDigits(row?.notes || ""),
    websiteHost: row?.website_host,
    notes: row?.notes,
  }, records, { ignoreId: row?.id });
  if (match.kind === "review") return "ambiguous";
  if (match.kind === "block") return "duplicate";
  return "";
}

export function weekdayAllowance(submittedToday) {
  return canSubmitOutreach({ target: WEEKDAY_TARGET, submittedToday });
}
