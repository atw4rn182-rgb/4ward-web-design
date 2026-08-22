import { NextResponse } from "next/server";
import { getStripeEnv } from "@/lib/stripe/env";
import { verifyStripeSignature } from "@/lib/stripe/verify-webhook";
import {
  applyCheckoutSessionEvent,
  applyInvoiceEvent,
} from "@/lib/payments/sync-stripe-session";
import { applyQuoteCheckoutSessionEvent } from "@/lib/payments/sync-quote-session";
import {
  sendPaymentConfirmation,
  sendQuotePaymentConfirmation,
} from "@/lib/payments/send-confirmation";
import { isQuoteCheckoutSession } from "@/lib/payments/quote-stripe";
import { isLiveVerificationCheckoutSession } from "@/lib/payments/live-verification-stripe";
import { applyLiveVerificationCheckoutSessionEvent } from "@/lib/payments/sync-live-verification-session";
import { sendLiveVerificationConfirmation } from "@/lib/payments/send-live-verification-confirmation";

export const runtime = "nodejs";

export async function POST(request) {
  const { webhookSecret } = getStripeEnv();
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    verifyStripeSignature(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature failed:", error.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (String(event.type || "").startsWith("checkout.session.")) {
      const session = event.data && event.data.object;
      if (isQuoteCheckoutSession(session)) {
        const quote = await applyQuoteCheckoutSessionEvent(event.type, session);
        if (quote && quote.payment_status === "paid") {
          await sendQuotePaymentConfirmation(session, quote);
        }
      } else if (isLiveVerificationCheckoutSession(session)) {
        const result = await applyLiveVerificationCheckoutSessionEvent(
          event.type,
          session
        );
        if (result && result.sendConfirmation) {
          await sendLiveVerificationConfirmation(session);
        }
      } else {
        const payment = await applyCheckoutSessionEvent(event.type, session);
        if (payment && payment.status === "paid") {
          await sendPaymentConfirmation(session);
        }
      }
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      await applyInvoiceEvent(event.type, event.data && event.data.object);
    }
  } catch (error) {
    console.error("Stripe webhook handler failed:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
