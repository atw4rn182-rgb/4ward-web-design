"use client";

import { useActionState } from "react";
import { researchProspectAction, researchQueueAction, type ProspectActionState } from "@/app/admin/prospect-actions";
import { discoveryProvider } from "@/lib/prospects/research.mjs";

const initial: ProspectActionState = {};

export function ResearchQueueButton({ awaiting = 0, unavailable = false }: { awaiting?: number; unavailable?: boolean }) {
  const [state, action, pending] = useActionState(researchQueueAction, initial);
  const discovery = discoveryProvider();
  const reason = unavailable
    ? "Prospect tables are not available, so research cannot run."
    : awaiting < 1
      ? "No saved business is missing a company name, email, or location."
      : "";
  return (
    <section className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold">Research</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{discovery.reason}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Provider: {discovery.id}. Available: {discovery.available ? "yes" : "no"}. Tested: {discovery.tested ? "yes" : "no"}.
      </p>
      <ul className="mt-3 grid gap-2">
        {(discovery.options || []).map((option) => (
          <li key={option.id} className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm text-muted">
            <span className="font-semibold text-ink">{option.name}. </span>
            {option.cost} Not enabled.
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        A company name, valid email, and New Mexico or West Texas location become Ready without a source page. A missing name, email, or location stays Pending with that exact reason. This check does not invent those details and does not send email.
      </p>
      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending || Boolean(reason)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Researching…" : "Research pending queue"}
        </button>
        {reason ? <p className="mt-2 text-sm text-muted">{reason}</p> : null}
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
