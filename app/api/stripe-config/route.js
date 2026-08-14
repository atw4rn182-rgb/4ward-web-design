import { NextResponse } from "next/server";

export async function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const liveMode =
    publishableKey.startsWith("pk_live_") && secret.startsWith("sk_live_");

  return NextResponse.json(
    {
      publishableKey,
      configured: Boolean(publishableKey && secret),
      liveMode,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
