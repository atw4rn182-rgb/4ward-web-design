/**
 * Future outreach will use the existing 4Ward business mailbox.
 * The provider and sign-in method are intentionally unknown here.
 * Passwords and mailbox tokens are never stored.
 * Sending stays disabled until a later phase authorizes the mailbox.
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
