import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/admin";
import { connectFromCode } from "@/lib/gmail/mailbox.mjs";
import { GMAIL_STATE_COOKIE, readCookie, statesMatch } from "@/lib/gmail/oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finish(request: Request, code: string) {
  const url = new URL("/admin/prospects", request.url);
  url.searchParams.set("gmail", code);
  const response = NextResponse.redirect(url);
  response.cookies.set(GMAIL_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/admin/gmail",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", "/admin/prospects");
    return NextResponse.redirect(login);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return finish(request, "denied");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookieState = readCookie(request.headers.get("cookie"), GMAIL_STATE_COOKIE);
  if (!statesMatch(state, cookieState)) return finish(request, "state");

  const result = await connectFromCode(code);
  const allowed = new Set(["connected", "wrong-account", "storage", "unconfigured", "exchange"]);
  return finish(request, allowed.has(result) ? result : "exchange");
}
