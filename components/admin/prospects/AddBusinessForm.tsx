"use client";

import { useActionState, useState } from "react";
import { addProspectAction, type ProspectActionState } from "@/app/admin/prospect-actions";

const initial: ProspectActionState = {};
const field =
  "min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm";

export function AddBusinessForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addProspectAction, initial);

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white"
        aria-expanded={open}
      >
        Add Business
      </button>
      {open ? (
        <form action={formAction} className="mt-4 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
          <p className="text-sm leading-relaxed text-muted">
            Manually added businesses are queued with priority for the next scheduled batch. Saving does not send an email.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              Business name
              <input name="businessName" required maxLength={120} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-semibold text-ink">
              City
              <input name="city" maxLength={80} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Website
              <input name="website" inputMode="url" className={`${field} mt-1`} placeholder="example.com" />
            </label>
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              Public email
              <input name="email" type="email" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              Notes
              <textarea name="notes" rows={3} maxLength={2000} className={`${field} mt-1`} />
            </label>
          </div>
          {state.error ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {state.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Queue business"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
