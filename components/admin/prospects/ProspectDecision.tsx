"use client";

import { useActionState } from "react";
import { updateProspectStatusAction, type ProspectActionState } from "@/app/admin/prospect-actions";

const initial: ProspectActionState = {};

export function ProspectDecision({ id }: { id: string }) {
  const [state, action, pending] = useActionState(updateProspectStatusAction, initial);
  return (
    <form action={action} className="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        name="status"
        value="not_interested"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
      >
        Not interested
      </button>
      <button
        type="submit"
        name="status"
        value="do_not_contact"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
      >
        Do not contact
      </button>
      {state.error ? <p className="w-full text-sm text-red-800" role="alert">{state.error}</p> : null}
      {state.message ? <p className="w-full text-sm text-emerald-900">{state.message}</p> : null}
    </form>
  );
}
