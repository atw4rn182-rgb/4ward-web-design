"use client";

import { useActionState, useState } from "react";
import { loginAction, type AuthState } from "../actions";
import { createClient } from "@/lib/supabase/client";

const initialState: AuthState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

  async function requestPasswordReset() {
    setResetMessage(null);
    const emailInput = document.getElementById("email") as HTMLInputElement | null;
    const email = emailInput?.value?.trim() || "";
    if (!email) {
      setResetMessage({ type: "error", text: "Enter your email first, then request a reset link." });
      return;
    }

    setResetBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setResetBusy(false);

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("redirect")) {
        setResetMessage({
          type: "error",
          text: "Reset link URL is not allowed. In Supabase Redirect URLs, add this site’s /admin/reset-password path.",
        });
        return;
      }
      setResetMessage({
        type: "error",
        text: "Could not send a reset email. Confirm the email is correct and try again.",
      });
      return;
    }

    setResetMessage({
      type: "ok",
      text: "If that email is registered, a password reset link is on the way. Check your inbox.",
    });
  }

  return (
    <form className="grid gap-2" action={formAction}>
      <input type="hidden" name="next" value={nextPath} />

      <label className="text-sm font-semibold text-ink/80" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        className="mb-2 min-h-[46px] w-full rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
        type="email"
        name="email"
        autoComplete="username"
        required
      />

      <label className="text-sm font-semibold text-ink/80" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        className="mb-2 min-h-[46px] w-full rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
        type="password"
        name="password"
        autoComplete="current-password"
      />

      {state?.error ? (
        <p className="mb-1 text-sm font-semibold text-red-700">{state.error}</p>
      ) : null}

      {state?.sent ? (
        <p className="mb-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          Check your email for a sign-in link. It may take a minute to arrive.
        </p>
      ) : null}

      {resetMessage ? (
        <p
          className={
            resetMessage.type === "ok"
              ? "mb-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
              : "mb-1 text-sm font-semibold text-red-700"
          }
        >
          {resetMessage.text}
        </p>
      ) : null}

      <button
        className="mt-1 inline-flex min-h-[46px] items-center justify-center rounded-full bg-gradient-to-br from-brand-deep via-brand-blue to-brand-copper px-4 py-2 font-bold text-white shadow-soft transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
        type="submit"
        name="intent"
        value="password"
        disabled={pending || resetBusy}
      >
        {pending ? "Signing in…" : "Sign in with password"}
      </button>
      <button
        className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 font-semibold text-ink transition hover:border-brand-blue/40 disabled:cursor-wait disabled:opacity-70"
        type="submit"
        name="intent"
        value="otp"
        disabled={pending || resetBusy}
      >
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </button>
      <button
        className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-transparent px-4 py-2 text-sm font-semibold text-brand-deep underline-offset-2 transition hover:underline disabled:cursor-wait disabled:opacity-70"
        type="button"
        onClick={() => void requestPasswordReset()}
        disabled={pending || resetBusy}
      >
        {resetBusy ? "Sending reset link…" : "Forgot password?"}
      </button>
    </form>
  );
}
