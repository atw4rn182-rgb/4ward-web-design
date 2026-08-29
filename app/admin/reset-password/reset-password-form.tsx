"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "loading" | "ready" | "success" | "invalid";

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashType = hashParams.get("type");

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          // Clean sensitive query params from the address bar.
          window.history.replaceState({}, "", "/admin/reset-password");
        } else if (tokenHash && (type === "recovery" || !type)) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (otpError) throw otpError;
          window.history.replaceState({}, "", "/admin/reset-password");
        } else if (accessToken && refreshToken && (hashType === "recovery" || !hashType)) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          window.history.replaceState({}, "", "/admin/reset-password");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session) {
          setPhase("invalid");
          setError(
            "This password reset link is invalid or has expired. Request a new one from the admin sign-in page."
          );
          return;
        }

        setPhase("ready");
      } catch {
        if (cancelled) return;
        setPhase("invalid");
        setError(
          "This password reset link is invalid or has expired. Request a new one from the admin sign-in page."
        );
      }
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message || "Could not update your password. Try again.");
      return;
    }

    setPhase("success");
    await supabase.auth.signOut();
    window.setTimeout(() => {
      router.replace("/admin/login");
    }, 1800);
  }

  if (phase === "loading") {
    return (
      <p className="rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold text-muted">
        Verifying your reset link…
      </p>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="grid gap-3">
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
        <a
          className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 font-semibold text-ink transition hover:border-brand-blue/40"
          href="/admin/login"
        >
          Back to admin sign in
        </a>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="grid gap-3">
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          Password updated. Redirecting you to the admin sign-in page…
        </p>
        <a
          className="inline-flex min-h-[46px] items-center justify-center rounded-full bg-gradient-to-br from-brand-deep via-brand-blue to-brand-copper px-4 py-2 font-bold text-white shadow-soft"
          href="/admin/login"
        >
          Continue to sign in
        </a>
      </div>
    );
  }

  return (
    <form className="grid gap-2" onSubmit={onSubmit}>
      <label className="text-sm font-semibold text-ink/80" htmlFor="new-password">
        New password
      </label>
      <input
        id="new-password"
        className="mb-2 min-h-[46px] w-full rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <label className="text-sm font-semibold text-ink/80" htmlFor="confirm-password">
        Confirm password
      </label>
      <input
        id="confirm-password"
        className="mb-2 min-h-[46px] w-full rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />

      <p className="mb-1 text-xs leading-relaxed text-muted">
        Use at least 8 characters with at least one letter and one number.
      </p>

      {error ? <p className="mb-1 text-sm font-semibold text-red-700">{error}</p> : null}

      <button
        className="mt-1 inline-flex min-h-[46px] items-center justify-center rounded-full bg-gradient-to-br from-brand-deep via-brand-blue to-brand-copper px-4 py-2 font-bold text-white shadow-soft transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={busy}
      >
        {busy ? "Saving…" : "Save new password"}
      </button>
      <a
        className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-center font-semibold text-ink transition hover:border-brand-blue/40"
        href="/admin/login"
      >
        Cancel
      </a>
    </form>
  );
}
