import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe/verify-webhook";
import {
  applyCheckoutSessionEvent,
  applyInvoiceEvent,
} from "@/lib/payments/sync-stripe-session";
import { sendPaymentConfirmation } from "@/lib/payments/send-confirmation";

export const runtime = "nodejs";

export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    verifyStripeSignature(rawBody, signature, secret);
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
      const payment = await applyCheckoutSessionEvent(
        event.type,
        event.data && event.data.object
      );
      if (payment && payment.status === "paid") {
        await sendPaymentConfirmation(event.data && event.data.object);
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
