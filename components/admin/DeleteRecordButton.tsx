"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAdminRecordAction,
  type DeleteRecordState,
} from "@/app/admin/delete-actions";
import type { DeletableKind } from "@/lib/admin/disposable-records";

const initial: DeleteRecordState = {};

type DeleteRecordButtonProps = {
  kind: DeletableKind;
  id: string;
  label: string;
  disposable: boolean;
  allowProductionDelete?: boolean;
  compact?: boolean;
  redirectTo?: string;
};

export function DeleteRecordButton({
  kind,
  id,
  label,
  disposable,
  allowProductionDelete = false,
  compact = false,
  redirectTo,
}: DeleteRecordButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [forceProduction, setForceProduction] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAdminRecordAction, initial);

  useEffect(() => {
    if (state.ok && state.deletedId === id) {
      setOpen(false);
      setConfirmText("");
      setForceProduction(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    }
  }, [state.ok, state.deletedId, id, router, redirectTo]);

  const canSubmit =
    confirmText === "DELETE" && (disposable || (allowProductionDelete && forceProduction));

  if (!disposable && !allowProductionDelete) {
    return (
      <span
        className="inline-flex min-h-10 items-center rounded-full border border-black/10 bg-black/[0.03] px-3 text-xs font-semibold text-muted"
        title="Protected production record"
      >
        Protected
      </span>
    );
  }

  return (
    <div className={compact ? "relative" : "w-full sm:w-auto"}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${
            disposable
              ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
              : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
          } ${compact ? "w-auto" : "w-full sm:w-auto"}`}
          aria-label={`Delete ${label}`}
        >
          <span aria-hidden="true">🗑</span>
          Delete
        </button>
      ) : (
        <form
          action={formAction}
          className="rounded-2xl border border-red-200 bg-red-50/80 p-3 shadow-soft"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="forceProduction" value={forceProduction ? "1" : "0"} />

          <p className="text-sm font-semibold text-red-950">
            {disposable ? "Delete this test record?" : "Delete a production record?"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-red-900/80">
            {label}
            {!disposable
              ? " This does not look like test data. Production deletes require an explicit confirmation."
              : " This cannot be undone."}
          </p>

          {!disposable ? (
            <label className="mt-3 flex items-start gap-2 text-xs font-medium text-amber-950">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={forceProduction}
                onChange={(event) => setForceProduction(event.target.checked)}
              />
              <span>I understand this may be a real production record.</span>
            </label>
          ) : null}

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
            <p className="mt-2 text-xs font-semibold text-red-800" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.ok && state.message ? (
            <p className="mt-2 text-xs font-semibold text-emerald-800" role="status">
              {state.message}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || !canSubmit}
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
                setForceProduction(false);
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

export function TestRecordBadge({ label = "Test record" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-amber-950">
      {label}
    </span>
  );
}
