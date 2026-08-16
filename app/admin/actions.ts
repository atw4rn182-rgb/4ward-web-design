"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { getActionOrigin, safeAdminNext } from "@/lib/supabase/origin";

export type AuthState = {
  error?: string;
  sent?: boolean;
};

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for admin access." } as AuthState;
  }
  return null;
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const intent = String(formData.get("intent") || "otp");
  const next = safeAdminNext(String(formData.get("next") || "/admin/dashboard"));

  if (!email) {
    return { error: "Email is required." };
  }

  if (!getSupabasePublicEnv().configured) {
    return {
      error:
        "Admin login is not configured yet. Add Supabase environment variables in Vercel.",
    };
  }

  const supabase = await createClient();

  if (intent === "password") {
    if (!password) {
      return { error: "Enter your password, or use the email sign-in link instead." };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return { error: "Invalid email or password." };
    }

    const denied = await requireAdmin(supabase, data.user.id);
    if (denied) return denied;

    redirect(next);
  }

  const origin = await getActionOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("sending magic link email") || message.includes("error sending")) {
      return {
        error:
          "Email sign-in is not available until custom SMTP is added in Superbase. Use your password to sign in.",
      };
    }
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
    return {
      error:
        "Could not send a sign-in link. Use your password below, or try again in a minute.",
    };
  }

  return { sent: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
