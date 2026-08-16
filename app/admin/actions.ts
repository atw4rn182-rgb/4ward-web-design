"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActionOrigin, safeAdminNext } from "@/lib/supabase/origin";

export type AuthState = {
  error?: string;
  sent?: boolean;
};

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const next = safeAdminNext(String(formData.get("next") || "/admin/dashboard"));

  if (!email) {
    return { error: "Email is required." };
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return {
      error:
        "Admin login is not configured yet. Add Supabase environment variables in Vercel.",
    };
  }

  const origin = await getActionOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error && /configured|environment|invalid api/i.test(error.message)) {
    return { error: "Admin login is not configured yet. Check the Supabase keys." };
  }

  return { sent: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
