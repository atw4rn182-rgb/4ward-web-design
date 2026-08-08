import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight Edge gate for /admin.
 * Full session validation happens in the admin dashboard server layout
 * via @supabase/ssr (Node/server runtime), which avoids Edge __dirname issues.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === "/admin/login";
  const isAdminRoute = pathname.startsWith("/admin");

  if (!isAdminRoute) {
    return NextResponse.next();
  }

  const hasSupabaseSession = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.includes("-auth-token") ||
        (cookie.name.startsWith("sb-") && Boolean(cookie.value))
    );

  if (!isLoginRoute && !hasSupabaseSession) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    if (pathname !== "/admin") {
      redirectUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (isLoginRoute && hasSupabaseSession) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/admin" && hasSupabaseSession) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
