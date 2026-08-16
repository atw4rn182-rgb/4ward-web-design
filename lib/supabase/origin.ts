export function safeAdminNext(next: string | null | undefined) {
  const value = String(next || "/admin/dashboard");
  return value.startsWith("/admin") && value !== "/admin/login"
    ? value
    : "/admin/dashboard";
}

export async function getActionOrigin() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto =
    h.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "development" ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return String(process.env.SITE_URL || "https://4wardwebdesign.com").replace(
    /\/$/,
    ""
  );
}

export function getRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto =
      forwardedProto ||
      (process.env.NODE_ENV === "development" ? "http" : "https");
    return `${proto}://${forwardedHost}`;
  }
  return url.origin;
}
