import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/admin";
import { gmailConnectionStatus } from "@/lib/gmail/mailbox.mjs";
import { authorizationUrl, createOAuthState, gmailEnvReady, GMAIL_STATE_COOKIE, sameHostAsRedirect } from "@/lib/gmail/oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function prospects(request: Request, code: string) {
  const url = new URL("/admin/prospects", request.url);
  url.searchParams.set("gmail", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", "/admin/prospects");
    return NextResponse.redirect(login);
  }
  if (!gmailEnvReady()) return prospects(request, "unconfigured");
  if (!sameHostAsRedirect(request.url)) return prospects(request, "host");
  const status = await gmailConnectionStatus();
  if (status.pendingMigration) return prospects(request, "storage");

  const state = createOAuthState();
  const destination = authorizationUrl(state);
  if (!state || !destination) return prospects(request, "unconfigured");

  const response = NextResponse.redirect(destination);
  response.cookies.set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/admin/gmail",
    maxAge: 600,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
