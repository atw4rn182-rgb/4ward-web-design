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
  // During a Supabase outage there is no onboarding row; the Stripe onboarding_ref
  // keys the emails instead so the team is still notified with full details.
  const recordKey = onboardingId || payload.onboardingRef;
  if (!recordKey) {
    return { ok: false, error: "Onboarding record missing." };
  }

  const email = payload.email || "";
  const customerEventKey = `onboarding_pending:${recordKey}`;
  const internalEventKey = `onboarding_pending_internal:${recordKey}`;

  return deliverDualEmails({
    customerEventKey,
    internalEventKey,
    eventType: "onboarding_pending",
    recipientEmail: email,
    metadata: {
      onboardingId: onboardingId || null,
      onboardingRef: payload.onboardingRef || null,
      tier: payload.tier || "",
      companyName: payload.companyName || "",
    },
    sendInternal: () => sendOnboardingPendingInternalEmail(payload),
    sendCustomer: () => sendOnboardingPendingCustomerEmail(payload),
  });
}
