"use client";

import { useActionState, useState } from "react";
import {
  importProspectListAction,
  previewProspectImportAction,
  type ProspectActionState,
} from "@/app/admin/prospect-actions";

const initial: ProspectActionState = {};

export function PasteProspectList({ unavailable = false }: { unavailable?: boolean }) {
  const [paste, setPaste] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [previewState, previewAction, previewPending] = useActionState(previewProspectImportAction, initial);
  const [importState, importAction, importPending] = useActionState(importProspectListAction, initial);
  const rows = importState.preview || previewState.preview || [];
  const canImport = rows.some((row) => row.result === "import");

  return (
    <div className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="text-lg font-semibold text-ink">Paste prospect list</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        One business per line: Business Name | email@example.com. A two-column table with Business Name and Email headers also works. Pasted text is saved as data. Importing does not send email.
      </p>
      <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="prospect-paste">
        Businesses
        <textarea
          id="prospect-paste"
          value={paste}
          onChange={(event) => {
            setPaste(event.target.value);
            setConfirmed(false);
          }}
          rows={6}
          maxLength={50000}
          disabled={unavailable}
          placeholder={"Bob's Auto Body | office@example.com"}
          className="mt-1 min-h-32 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
        />
      </label>
      {unavailable ? <p className="mt-2 text-sm text-muted">Prospect tables are not available, so a list cannot be imported.</p> : null}
      <form action={previewAction} className="mt-3">
        <input type="hidden" name="paste" value={paste} />
        <button
          type="submit"
          disabled={unavailable || previewPending || !paste.trim()}
          className="inline-flex min-h-11 items-center rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {previewPending ? "Checking…" : "Preview list"}
        </button>
      </form>
      {previewState.error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{previewState.error}</p> : null}
      {previewState.message ? <p className="mt-3 text-sm text-ink">{previewState.message}</p> : null}
      {rows.length ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={`${row.line}-${row.email}`} className="rounded-xl border border-black/10 px-3 py-3 text-sm">
              <p className="font-semibold text-ink">{row.name || "Missing name"}</p>
              <p className="mt-1 break-all">{row.email || "Missing email"}</p>
              {row.source ? <a className="mt-1 block break-all underline" href={row.source} target="_blank" rel="noreferrer">{row.source}</a> : <p className="mt-1 text-muted">No source link</p>}
              <p className="mt-2 font-semibold">{row.result === "import" ? "Will import" : row.result === "review" ? "Needs review" : "Will skip"}</p>
              <p className="mt-1 leading-relaxed text-muted">{row.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={importAction} className="mt-4">
        <input type="hidden" name="paste" value={paste} />
        <label className="flex min-h-11 items-start gap-3 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            name="confirmImport"
            className="mt-1 h-5 w-5"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={!canImport || unavailable}
          />
          Import the accepted rows as Pending research. This does not send an email.
        </label>
        <button
          type="submit"
          disabled={unavailable || importPending || !canImport || !confirmed}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {importPending ? "Importing…" : "Import accepted rows"}
        </button>
      </form>
      {importState.error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{importState.error}</p> : null}
      {importState.summary ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          {importState.message} Imported {importState.summary.imported}, skipped {importState.summary.skipped}, review {importState.summary.review}. Batch {importState.summary.batchId}.
        </p>
      ) : null}
    </div>
  );
}
