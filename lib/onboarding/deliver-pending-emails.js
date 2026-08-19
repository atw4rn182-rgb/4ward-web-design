import { deliverDualEmails } from "@/lib/email/dual-delivery";
import {
  sendOnboardingPendingCustomerEmail,
  sendOnboardingPendingInternalEmail,
} from "@/lib/email/static-forms";

/**
 * Idempotent onboarding pre-payment emails (internal + customer).
 */
export async function deliverOnboardingPendingEmails(payload) {
  const onboardingId = payload.onboardingId;
  if (!onboardingId) {
    return { ok: false, error: "Onboarding record missing." };
  }

  const email = payload.email || "";
  const customerEventKey = `onboarding_pending:${onboardingId}`;
  const internalEventKey = `onboarding_pending_internal:${onboardingId}`;

  return deliverDualEmails({
    customerEventKey,
    internalEventKey,
    eventType: "onboarding_pending",
    recipientEmail: email,
    metadata: {
      onboardingId,
      tier: payload.tier || "",
      companyName: payload.companyName || "",
    },
    sendInternal: () => sendOnboardingPendingInternalEmail(payload),
    sendCustomer: () => sendOnboardingPendingCustomerEmail(payload),
  });
}
