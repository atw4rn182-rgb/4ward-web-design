"use client";

import { useActionState } from "react";
import { researchProspectAction, researchQueueAction, type ProspectActionState } from "@/app/admin/prospect-actions";
import { discoveryProvider } from "@/lib/prospects/research.mjs";

const initial: ProspectActionState = {};

export function ResearchQueueButton() {
  const [state, action, pending] = useActionState(researchQueueAction, initial);
  const discovery = discoveryProvider();
  return (
    <section className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold">Research</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{discovery.reason}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Research pending queue checks up to five queued businesses, manual entries first. It reads a business’s own public website only when that site allows it, then saves a short result and an unsent draft.
      </p>
      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Researching…" : "Research pending queue"}
        </button>
      </form>
      {state.error ? <p className="mt-3 text-sm text-red-800" role="alert">{state.error}</p> : null}
      {state.message ? <p className="mt-3 text-sm text-emerald-900">{state.message}</p> : null}
    </section>
  );
}

export function ResearchProspectButton({ prospectId }: { prospectId: string }) {
  const [state, action, pending] = useActionState(researchProspectAction, initial);
  return (
    <form action={action} className="mb-4 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <input type="hidden" name="id" value={prospectId} />
      <h2 className="font-display text-lg font-bold">Research this prospect</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Uses the details on this record and, when permitted, one public page on the business’s own website. Nothing is emailed.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Researching…" : "Research prospect"}
      </button>
      {state.error ? <p className="mt-3 text-sm text-red-800" role="alert">{state.error}</p> : null}
      {state.message ? <p className="mt-3 text-sm text-emerald-900">{state.message}</p> : null}
    </form>
  );
}
