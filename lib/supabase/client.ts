import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, key } = getSupabasePublicEnv();

  return createBrowserClient(
    url || "https://placeholder.supabase.co",
    key || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder"
  );
}
