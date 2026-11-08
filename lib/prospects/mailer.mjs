/**
 * Weekday batches run at 9:00 AM America/Denver.
 * A connected mailbox can send one checked message. Opt-outs, customers,
 * and duplicates are refused, and an uncertain Gmail response is not retried.
 */
import { sendOutreachMessage } from "../gmail/send.mjs";

export const OUTREACH_SCHEDULER_ACTIVE = true;

export function outreachMailer(options = {}) {
  const accessToken = String(options.accessToken || "").trim();
  const mailingAddress = String(options.mailingAddress || "").trim();
  const configured = Boolean(accessToken && mailingAddress);
  return {
    configured,
    provider: configured ? "gmail" : "unconfigured",
    schedulerActive: OUTREACH_SCHEDULER_ACTIVE,
    reason: configured ? "" : "Gmail is not connected or the mailing address is not saved.",
    async submit(input) {
      if (!configured) throw new Error("Outreach email is disabled.");
      return sendOutreachMessage({
        ...(input || {}),
        accessToken,
        mailingAddress,
        fetchImpl: options.fetchImpl,
      });
    },
  };
}
