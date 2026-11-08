import { isOneTimeOutreach } from "./authorized-launch.mjs";
import { isDuplicateDismissed, isDuplicateHold } from "./duplicates.mjs";
import { isQueuePaused, isUncertainHold } from "./queue.mjs";
import { qualificationGapMessages } from "./research.mjs";

const ONE_TIME_EMAIL = "nereecerodriguez956@gmail.com";

function textEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sendEmail(row) {
  return textEmail(row?.public_email || row?.publicEmail || row?.email);
}

function shownEmail(row) {
  return sendEmail(row) || textEmail(row?.secondary_email || row?.secondaryEmail) || "An email address is missing.";
}

export function suppressionBlocksApproval(row, suppressions) {
  const emails = new Set([sendEmail(row), textEmail(row?.secondary_email || row?.secondaryEmail)].filter(Boolean));
  return (suppressions || []).some((item) => {
    const itemEmail = textEmail(item?.email);
    if (!itemEmail || !emails.has(itemEmail)) return false;
    if (String(item?.prospect_id || "") === String(row?.id || "") && /^queued\b/i.test(String(item?.reason || ""))) return false;
    return true;
  });
}

export function customerBlocksApproval(row, customers) {
  const emails = new Set([sendEmail(row), textEmail(row?.secondary_email || row?.secondaryEmail)].filter(Boolean));
  return (customers || []).some((item) => emails.has(textEmail(item?.email)));
}

/** Exact reasons an administrator cannot move this record to Ready. */
export function approvalDecision(row, context = {}) {
  const messages = [];
  const status = String(row?.status || "");
  if (status === "sent" || status === "interested" || row?.sent_at || row?.sentAt) {
    messages.push("Already contacted. The sent record was not reset.");
  }
  if (status === "ready" && (row?.outreach_eligible === true || row?.outreachEligible === true)) {
    messages.push("This prospect is already Ready.");
  }
  if (isDuplicateHold(row) || isDuplicateDismissed(row)) {
    messages.push("Duplicate review. Held out of automatic sending.");
  }
  if (status === "do_not_contact" || status === "not_interested" || row?.suppressed || context.suppressed === true || suppressionBlocksApproval(row, context.suppressions)) {
    messages.push("This address is suppressed or opted out. It was not reactivated.");
  }
  if (context.customer === true || customerBlocksApproval(row, context.customers)) {
    messages.push("This email belongs to an existing customer.");
  }
  const email = sendEmail(row);
  const secondary = textEmail(row?.secondary_email || row?.secondaryEmail);
  if (email === ONE_TIME_EMAIL || secondary === ONE_TIME_EMAIL || isOneTimeOutreach(row?.notes)) {
    messages.push("This one-time test address is excluded from future outreach.");
  }
  if (isQueuePaused(row)) messages.push("An administrator paused this prospect. It stays out of the send.");
  if (isUncertainHold(row) || context.uncertain === true) {
    messages.push("Gmail's response was uncertain. This recipient is held for review and was not retried.");
  }
  const findings = [row?.notes, row?.research_notes, row?.researchNotes, row?.gbp_observations].filter(Boolean).join(" ");
  if (/(?<!not )(?:permanently closed|listed as closed)|business is closed/i.test(findings)) {
    messages.push("The business is closed and is excluded from outreach.");
  }
  for (const gap of qualificationGapMessages({
    businessName: row?.business_name || row?.businessName,
    publicEmail: email,
    city: row?.city,
    serviceArea: row?.service_area || row?.serviceArea,
  })) {
    messages.push(gap);
  }
  return {
    id: String(row?.id || ""),
    name: String(row?.business_name || row?.businessName || "This business"),
    email: shownEmail(row),
    ok: messages.length === 0,
    reasons: [...new Set(messages)],
  };
}

export function approvedResearchNote(existing, approver, approvedAt) {
  const prior = String(existing || "");
  const unverified = /not independently verified/i.test(prior)
    ? "Imported business contact. The email was not independently verified."
    : "";
  const who = String(approver || "the signed-in administrator").trim();
  const when = String(approvedAt || "").trim();
  return [unverified, `Admin approved by ${who} at ${when}.`].filter(Boolean).join(" ").slice(0, 1000);
}
