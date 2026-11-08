"use client";

import { useActionState } from "react";
import { pauseProspectAction, removeProspectAction, type ProspectActionState } from "@/app/admin/prospect-actions";

const initial: ProspectActionState = {};

export function QueueControls({ id, status, sent = false }: { id: string; status: string; sent?: boolean }) {
  const [paused, pauseAction, pausePending] = useActionState(pauseProspectAction, initial);
  const [removed, removeAction, removePending] = useActionState(removeProspectAction, initial);
  const canPause = !sent && status !== "sent" && status !== "interested" && status !== "do_not_contact";
  const canRemove = !sent && (status === "queued" || status === "researching");
  if (!canPause && !canRemove) return null;

  return (
    <div className="mt-3 space-y-2">
      {canPause ? (
        <form action={pauseAction} className="rounded-xl border border-black/10 bg-white p-3">
          <input type="hidden" name="id" value={id} />
          <label className="flex min-h-11 items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="confirmPause" className="mt-1 h-5 w-5" disabled={pausePending} />
            Pause this prospect. It stays saved and is not emailed.
          </label>
          <button type="submit" disabled={pausePending} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/10 px-3 text-xs font-semibold">
            {pausePending ? "Pausing…" : "Pause prospect"}
          </button>
          {paused.error ? <p className="mt-2 text-sm text-red-800" role="alert">{paused.error}</p> : null}
          {paused.message ? <p className="mt-2 text-sm text-emerald-900">{paused.message}</p> : null}
        </form>
      ) : null}
      {canRemove ? (
        <form action={removeAction} className="rounded-xl border border-black/10 bg-white p-3">
          <input type="hidden" name="id" value={id} />
          <label className="flex min-h-11 items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="confirmRemove" className="mt-1 h-5 w-5" disabled={removePending} />
            Remove this queued prospect. A sent record cannot be removed here.
          </label>
          <button type="submit" disabled={removePending} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/10 px-3 text-xs font-semibold">
            {removePending ? "Removing…" : "Remove from queue"}
          </button>
          {removed.error ? <p className="mt-2 text-sm text-red-800" role="alert">{removed.error}</p> : null}
          {removed.message ? <p className="mt-2 text-sm text-emerald-900">{removed.message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
