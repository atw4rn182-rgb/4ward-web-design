import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { User } from "@supabase/supabase-js";

export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const service = createServiceClient();
  const adminLookup = service || supabase;
  const { data: adminRow, error } = await adminLookup
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !adminRow) {
    return null;
  }

  return user;
}
