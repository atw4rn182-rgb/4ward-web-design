"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "../actions";

const initialState: AuthState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

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
        required
      />

      {state?.error ? (
        <p className="mb-1 text-sm font-semibold text-red-700">{state.error}</p>
      ) : null}

      <button
        className="mt-1 inline-flex min-h-[46px] items-center justify-center rounded-full bg-gradient-to-br from-brand-deep via-brand-blue to-brand-copper px-4 py-2 font-bold text-white shadow-soft transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
