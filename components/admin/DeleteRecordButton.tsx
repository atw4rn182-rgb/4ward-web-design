"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAdminRecordAction,
  type DeletableKind,
  type DeleteRecordState,
} from "@/app/admin/delete-actions";

const initial: DeleteRecordState = {};

type DeleteRecordButtonProps = {
  kind: DeletableKind;
  id: string;
  label: string;
  detail?: string;
  compact?: boolean;
  redirectTo?: string;
};

export function DeleteRecordButton({
  kind,
  id,
  label,
  detail,
  compact = false,
  redirectTo,
}: DeleteRecordButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [removed, setRemoved] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAdminRecordAction, initial);

  useEffect(() => {
    if (state.ok && state.deletedId === id) {
      setRemoved(true);
      setOpen(false);
      setConfirmText("");
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    }
  }, [state.ok, state.deletedId, id, router, redirectTo]);

  if (removed) {
    return (
      <p className="text-xs font-semibold text-emerald-800" role="status">
        {state.message || "Deleted"}
      </p>
    );
  }

  return (
    <div className={compact ? "relative min-w-[9rem]" : "w-full sm:w-auto"}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 ${
            compact ? "w-auto" : "w-full sm:w-auto"
          }`}
          aria-label={`Delete ${label}`}
        >
          <span aria-hidden="true">🗑</span>
          Delete
        </button>
      ) : (
        <form
          action={formAction}
          className="rounded-2xl border border-red-200 bg-red-50/90 p-3 shadow-soft"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="label" value={label} />

          <p className="text-sm font-semibold text-red-950">Permanently delete this record?</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-red-950">{label}</p>
          {detail ? <p className="mt-1 text-xs leading-relaxed text-red-900/80">{detail}</p> : null}
          <p className="mt-1 break-all text-[0.65rem] text-red-900/70">ID: {id}</p>
          <p className="mt-2 text-xs leading-relaxed text-red-900/80">
            This cannot be undone. Only this one record will be removed.
          </p>

          <label className="mt-3 block text-xs font-semibold text-red-950">
            Type DELETE to confirm
            <input
              name="confirmToken"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-red-300/60"
              placeholder="DELETE"
            />
          </label>

          {state.error && !state.ok ? (
            <p className="mt-2 break-words text-xs font-semibold text-red-800" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || confirmText !== "DELETE"}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setConfirmText("");
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-ink sm:flex-none"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
