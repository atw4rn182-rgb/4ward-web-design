import { NextResponse } from "next/server";
import { getStripeEnv } from "@/lib/stripe/env";

export async function GET() {
  const stripe = getStripeEnv();

  return NextResponse.json(
    {
      publishableKey: stripe.publishableKey,
      configured: stripe.configured,
      liveMode: stripe.liveMode,
      publishableKind: stripe.publishableKind,
      secretKind: stripe.secretKind,
      hasWebhookSecret: Boolean(stripe.webhookSecret),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
