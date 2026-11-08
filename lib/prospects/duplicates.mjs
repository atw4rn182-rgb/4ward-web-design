import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { emailIdentity, identityKey, namesConflict, phoneDigits } from "./identity.mjs";
import { isPublishableEmail } from "./research.mjs";

export const DUPLICATE_REVIEW_NOTE = "Duplicate review. Held out of automatic sending.";
export const DUPLICATE_DISMISSED_NOTE = "Duplicate dismissed. The original was kept. No email was sent.";
export const RESEND_ONCE_NOTE = "Resend authorized once.";
const ONE_TIME_EMAIL = "nereecerodriguez956@gmail.com";

export function isDuplicateHold(row) {
  return /Duplicate review\. Held out of automatic sending\./i.test(String(row?.notes || ""));
}

export function isDuplicateDismissed(row) {
  return /Duplicate dismissed\. The original was kept\./i.test(String(row?.notes || ""));
}

export function isResendAuthorized(row) {
  return /Resend authorized once\./i.test(String(row?.notes || "")) && !isDuplicateHold(row);
}

export function outreachEmail(row) {
  const primary = emailIdentity(row?.public_email || row?.publicEmail || row?.email || "").normalized;
  if (primary) return primary;
  if (isResendAuthorized(row)) return emailIdentity(row?.secondary_email || row?.secondaryEmail || "").normalized;
  return "";
}

function closedText(row) {
  const text = [row?.notes, row?.research_notes, row?.researchNotes].filter(Boolean).join(" ");
  return /(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(text);
}

function originalRank(row) {
  const sent = row?.sent_at || row?.sentAt || row?.status === "sent" || row?.status === "interested" ? 0 : 1;
  const time = Date.parse(row?.queued_at || row?.queuedAt || row?.created_at || row?.createdAt || 0) || 0;
  return sent * 1e15 + time;
}

function rowEmail(row) {
  return emailIdentity(row?.public_email || row?.secondary_email || row?.email || "").normalized;
}

export function sendResultText(events) {
  const list = events || [];
  if (list.some((item) => item.event_type === "gmail_uncertain")) return "Gmail's response was uncertain. It was not retried.";
  if (list.some((item) => item.event_type === "gmail_accepted")) return "Accepted by Gmail";
  if (list.some((item) => item.event_type === "gmail_refused")) return "Gmail refused the message";
  return "Not sent";
}

export function hardDuplicateBlock(row, match) {
  const email = emailIdentity(row?.email || row?.public_email || "").normalized;
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) return "This one-time test address is excluded from future outreach.";
  if (email && !isPublishableEmail(email)) return "The email address is not valid.";
  if (closedText(row)) return "The business is closed and is excluded from outreach.";
  const record = match?.record || {};
  if (record.source === "customer") return "This email belongs to an existing customer.";
  if (record.status === "do_not_contact" || record.status === "not_interested") return "This address is suppressed or opted out. It was not reactivated.";
  if (record.source === "suppression" && !/^(queued|contacted)\b/i.test(record.reason || "")) {
    return "This address is suppressed or opted out. It was not reactivated.";
  }
  if (closedText(record)) return "The business is closed and is excluded from outreach.";
  return "";
}

export function duplicateReviewNotes({ kind, reason, matchId, matchName, previousSendAt, sendResult }) {
  return [
    `Kind: ${kind}.`,
    reason,
    matchId ? `Match: ${matchId}.` : "",
    matchName ? `Match name: ${matchName}.` : "",
    `Previous send: ${previousSendAt || "none"}.`,
    `Send result: ${sendResult || "Not sent"}.`,
  ].filter(Boolean).join(" ").slice(0, 1000);
}

export function duplicateKind(match) {
  if (match?.reason === "email") return "email";
  if (match?.reason === "phone") return "phone";
  return "name";
}

/**
 * Email matches are grouped by the normalized address.
 * Company-name matches are listed separately and do not join an email group.
 */
export function groupDuplicateReviews(rows) {
  const list = (rows || []).filter((row) => row?.id && rowEmail(row) !== ONE_TIME_EMAIL && !isOneTimeOutreach(row?.notes));
  const reviews = [];
  const claimed = new Set();
  const byEmail = new Map();
  for (const row of list) {
    const email = rowEmail(row);
    if (!email) continue;
    const bucket = byEmail.get(email) || [];
    bucket.push(row);
    byEmail.set(email, bucket);
  }
  for (const [email, bucket] of byEmail) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((left, right) => originalRank(left) - originalRank(right));
    const original = ordered[0];
    for (const row of ordered.slice(1)) {
      if (row.sent_at || row.sentAt || row.status === "sent" || row.status === "interested") continue;
      if (isDuplicateDismissed(row) || isResendAuthorized(row)) continue;
      claimed.add(row.id);
      reviews.push({
        id: row.id,
        businessName: row.business_name || row.businessName || "",
        email,
        city: row.city || "",
        kind: "email",
        reason: "Same normalized email.",
        matchId: original.id,
        matchName: original.business_name || original.businessName || "",
        matchEmail: rowEmail(original),
        previousSendAt: original.sent_at || original.sentAt || "",
        status: row.status || "",
      });
    }
  }
  for (let index = 0; index < list.length; index += 1) {
    for (let other = index + 1; other < list.length; other += 1) {
      const left = list[index];
      const right = list[other];
      const leftName = identityKey(left.business_name || left.businessName);
      const rightName = identityKey(right.business_name || right.businessName);
      const sameName = Boolean(leftName) && leftName === rightName;
      if (!sameName && !namesConflict(left.business_name || left.businessName, right.business_name || right.businessName)) continue;
      const ordered = [left, right].sort((a, b) => originalRank(a) - originalRank(b));
      const original = ordered[0];
      const later = ordered[1];
      if (claimed.has(later.id) || isDuplicateDismissed(later) || isResendAuthorized(later)) continue;
      if (later.sent_at || later.sentAt || later.status === "sent" || later.status === "interested") continue;
      claimed.add(later.id);
      reviews.push({
        id: later.id,
        businessName: later.business_name || later.businessName || "",
        email: rowEmail(later),
        city: later.city || "",
        kind: "name",
        reason: sameName ? "Same company name in another saved record." : "Possible company-name match.",
        matchId: original.id,
        matchName: original.business_name || original.businessName || "",
        matchEmail: rowEmail(original),
        previousSendAt: original.sent_at || original.sentAt || "",
        status: later.status || "",
      });
    }
  }
  const byPhone = new Map();
  for (const row of list) {
    const phone = phoneDigits(row.notes || row.phone || "");
    if (!phone) continue;
    const bucket = byPhone.get(phone) || [];
    bucket.push(row);
    byPhone.set(phone, bucket);
  }
  for (const bucket of byPhone.values()) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((left, right) => originalRank(left) - originalRank(right));
    const original = ordered[0];
    for (const row of ordered.slice(1)) {
      if (claimed.has(row.id) || isDuplicateDismissed(row) || isResendAuthorized(row)) continue;
      if (row.sent_at || row.status === "sent") continue;
      claimed.add(row.id);
      reviews.push({
        id: row.id,
        businessName: row.business_name || "",
        email: rowEmail(row),
        city: row.city || "",
        kind: "phone",
        reason: "Same phone number.",
        matchId: original.id,
        matchName: original.business_name || "",
        matchEmail: rowEmail(original),
        previousSendAt: original.sent_at || "",
        status: row.status || "",
      });
    }
  }
  return reviews;
}

export function resendSafeguard(input) {
  const duplicate = input?.duplicate;
  const original = input?.original;
  const customer = input?.customer === true;
  const suppressed = input?.suppressed === true;
  const duplicateEvents = input?.duplicateEvents || [];
  const originalEvents = input?.originalEvents || [];
  const email = rowEmail(duplicate);
  if (!email) return "An email address is missing.";
  if (!isPublishableEmail(email)) return "The email address is not valid.";
  if (email === ONE_TIME_EMAIL || isOneTimeOutreach(duplicate?.notes)) return "This one-time test address is excluded from future outreach.";
  if (closedText(duplicate) || closedText(original)) return "The business is closed and is excluded from outreach.";
  if (customer) return "This email belongs to an existing customer.";
  if (suppressed) return "This address is suppressed or opted out. It was not reactivated.";
  if ([...duplicateEvents, ...originalEvents].some((item) => item.event_type === "gmail_uncertain")) {
    return "Gmail's response was uncertain. It was not retried.";
  }
  if (!(original?.sent_at || original?.sentAt || original?.status === "sent")) return "There is no previous send to repeat.";
  return "";
}

export function claimResend(current) {
  if (!current?.id) return { ok: false, already: false, error: "Prospect not found. Nothing was authorized." };
  if (current.sent_at || current.status === "sent" || current.status === "interested") {
    return { ok: false, already: false, error: "This record was already sent. No second resend was authorized." };
  }
  if (isResendAuthorized(current)) return { ok: false, already: true, error: "One resend is already authorized. No second resend was created." };
  if (!isDuplicateHold(current)) return { ok: false, already: false, error: "This record is not in duplicate review. Nothing was authorized." };
  return { ok: true, already: false, error: "" };
}

/** A one-time resend may pass a prospect duplicate. It never passes a customer, opt-out, or uncertain hold. */
export function resendCanPass(row, match) {
  if (!isResendAuthorized(row)) return false;
  const source = match?.record?.source;
  if (source === "customer") return false;
  if (source === "suppression" && !/^(queued|contacted)\b/i.test(match?.record?.reason || "")) return false;
  return source === "prospect" || source === "suppression";
}
