"use server";

import { getAdminUser } from "@/lib/supabase/admin";
import { createLiveVerificationCheckoutSession } from "@/lib/payments/live-verification-stripe";

export type LiveVerificationState = {
  ok?: boolean;
  error?: string;
  checkoutUrl?: string;
  sessionId?: string;
  message?: string;
};

export async function createLiveVerificationCheckoutAction(
  _prev: LiveVerificationState,
  _formData: FormData
): Promise<LiveVerificationState> {
  const user = await getAdminUser();
  if (!user) {
    return { error: "Unauthorized." };
  }

  try {
    const session = await createLiveVerificationCheckoutSession({
      adminEmail: user.email || "",
    });
    if (!session.url || !session.sessionId) {
      return { error: "Stripe did not return a checkout URL." };
    }
    if (!session.sessionId.startsWith("cs_live_")) {
      return { error: "Verification checkout must be created in live Stripe mode." };
    }

    return {
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      message:
        "Live $1 verification Checkout created. Open the link, pay with a real card, then confirm Admin → Payments and webhook logs.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create verification checkout.";
    return { error: message };
  }
}
