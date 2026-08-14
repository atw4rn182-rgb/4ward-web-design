import { NextResponse } from "next/server";

export async function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  return NextResponse.json(
    {
      publishableKey,
      configured: Boolean(publishableKey && process.env.STRIPE_SECRET_KEY),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
