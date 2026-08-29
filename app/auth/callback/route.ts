import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { getRequestOrigin, safeAdminNext } from "@/lib/supabase/origin";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const nextParam = request.nextUrl.searchParams.get("next");
  const isRecovery = type === "recovery";
  const next = isRecovery
    ? "/admin/reset-password"
    : safeAdminNext(nextParam);
  const { url, key, configured } = getSupabasePublicEnv();

  const fail = (reason: "link" | "unauthorized") =>
    NextResponse.redirect(
      isRecovery
        ? `${origin}/admin/reset-password?error=${reason}`
        : `${origin}/admin/login?error=${reason}`
    );

  if (!configured || (!code && !tokenHash)) {
    return fail("link");
  }

  let response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.redirect(`${origin}${next}`);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        type: (type || "magiclink") as EmailOtpType,
        token_hash: tokenHash || "",
      });

  if (error) {
    console.error("admin auth callback failed", error.message);
    return fail("link");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("link");
  }

  // Password recovery should reach the reset form even before admin_users checks
  // on dashboard routes; still require an admin row so non-admins cannot recover in.
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return fail("unauthorized");
  }

  return response;
}
