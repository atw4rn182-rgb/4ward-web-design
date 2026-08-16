import { NextResponse } from "next/server";

function keyKind(value) {
  if (!value) return "missing";
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  if (value.startsWith("eyJ")) return "jwt";
  return "other";
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

  let urlHost = null;
  try {
    urlHost = url ? new URL(url).host : null;
  } catch {
    urlHost = "invalid";
  }

  const isPlaceholder = /placeholder\.supabase\.co/i.test(url);

  return NextResponse.json(
    {
      configured: Boolean(url && anon && !isPlaceholder),
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anon),
      hasServiceRole: Boolean(service),
      urlHost,
      anonKeyKind: keyKind(anon),
      serviceKeyKind: keyKind(service),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
