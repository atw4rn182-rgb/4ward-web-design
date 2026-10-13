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
import { logPaymentPersistenceFailure } from "@/lib/payments/persistence-log";

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
    // 500 makes Stripe retry the event; handlers are idempotent per Stripe ID.
    const object = (event.data && event.data.object) || {};
    const metadata = object.metadata || {};
    const context = {
      stripe_event_id: event.id,
      event_type: event.type,
      checkout_session_id: object.object === "checkout.session" ? object.id : undefined,
      invoice_id: object.object === "invoice" ? object.id : object.invoice || undefined,
      payment_intent_id:
        typeof object.payment_intent === "string" ? object.payment_intent : undefined,
      subscription_id: typeof object.subscription === "string" ? object.subscription : undefined,
      stripe_customer_id: typeof object.customer === "string" ? object.customer : undefined,
      onboarding_ref: metadata.onboarding_ref,
      supabase_customer_id: metadata.supabase_customer_id,
      supabase_onboarding_id: metadata.supabase_onboarding_id,
      stripe_will_retry: true,
    };
    if (error && error.source === "supabase") {
      logPaymentPersistenceFailure("webhook_supabase_write_failed", context, error);
    } else {
      logPaymentPersistenceFailure("webhook_handler_failed", context, error);
    }
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
