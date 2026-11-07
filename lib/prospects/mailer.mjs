/**
 * Prospect batches stay disabled. The manual admin mailbox test lives in lib/gmail
 * and can send only to the signed-in administrator.
 */
export const OUTREACH_SCHEDULER_ACTIVE = false;

export function outreachMailer() {
  return {
    configured: false,
    provider: "unconfigured",
    schedulerActive: OUTREACH_SCHEDULER_ACTIVE,
    reason: "Email authorization is not part of this phase.",
    async submit() {
      throw new Error("Outreach email is disabled.");
    },
  };
}
