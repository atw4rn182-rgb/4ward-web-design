import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function createClient() {
  const { url, key } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    url || "https://placeholder.supabase.co",
    key || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    }
  );
}
