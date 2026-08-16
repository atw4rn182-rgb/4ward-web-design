"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { getActionOrigin } from "@/lib/supabase/origin";

export type AuthState = {
  error?: string;
  sent?: boolean;
};

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    return { error: "Email is required." };
  }

  if (!getSupabasePublicEnv().configured) {
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
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("signInWithOtp failed", error.message);
    const message = error.message.toLowerCase();
    if (message.includes("redirect")) {
      return {
        error:
          "The sign-in link URL is not allowed. In Supabase, add https://www.4wardwebdesign.com/auth/callback to Redirect URLs.",
      };
    }
    if (
      message.includes("signups not allowed") ||
      message.includes("user not found") ||
      message.includes("unable to validate")
    ) {
      return {
        error:
          "This email is not set up for admin access. Create the user in Supabase Auth first.",
      };
    }
    return { error: "Could not send a sign-in link. Try again in a minute." };
  }

  return { sent: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
