import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin, safeAdminNext } from "@/lib/supabase/origin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = requestUrl.searchParams.get("code");
  const next = safeAdminNext(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/admin/login?error=link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/admin/login?error=link`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/admin/login?error=link`);
  }

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/admin/login?error=unauthorized`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
