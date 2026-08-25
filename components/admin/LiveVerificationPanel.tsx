"use client";

import { useActionState } from "react";
import {
  createLiveVerificationCheckoutAction,
  type LiveVerificationState,
} from "@/app/admin/live-verification-actions";

const initial: LiveVerificationState = {};

export function LiveVerificationPanel() {
  const [state, action, pending] = useActionState(
    createLiveVerificationCheckoutAction,
    initial
  );

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-soft">
      <h2 className="font-display text-lg font-bold tracking-tight">
        Live payment verification
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Admin-only $1.00 live Stripe Checkout to verify webhook → Supabase → email.
        Not linked from the public site. Remove this panel after testing.
      </p>

      {state.error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {state.ok && state.message ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {state.message}
        </p>
      ) : null}

      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60 min-h-11 inline-flex items-center justify-center"
        >
          {pending ? "Creating…" : "Create $1 live verification Checkout"}
        </button>
      </form>

      {state.checkoutUrl ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Checkout URL
          </p>
          <a
            href={state.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all text-sm font-medium text-brand-blue underline"
          >
            {state.checkoutUrl}
          </a>
          {state.sessionId ? (
            <p className="mt-2 text-xs text-muted">Session: {state.sessionId}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
