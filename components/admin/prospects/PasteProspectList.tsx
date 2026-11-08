"use client";

import { useState } from "react";
import {
  importProspectListAction,
  previewProspectImportAction,
  type ImportPreviewRow,
} from "@/app/admin/prospect-actions";
import { classifyImport, parseProspectList, splitImportText } from "@/lib/prospects/import.mjs";

const PAGE_SIZE = 25;

function reviewedLocal(paste: string) {
  const parsed = parseProspectList(paste);
  if (parsed.error) return { error: parsed.error, rows: [] as ImportPreviewRow[], counts: { import: 0, skip: 0, review: 0 } };
  const local = classifyImport(parsed.rows, { prospects: [], customers: [], suppressions: [] }) as {
    rows: ImportPreviewRow[];
    counts: { import: number; skip: number; review: number };
  };
  return { error: "", rows: local.rows, counts: local.counts };
}

export function PasteProspectList({ unavailable = false }: { unavailable?: boolean }) {
  const [paste, setPaste] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState<ImportPreviewRow[]>([]);
  const [counts, setCounts] = useState({ import: 0, skip: 0, review: 0 });
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState("");
  const [checked, setChecked] = useState(false);

  function resetResult() {
    setConfirmed(false);
    setChecked(false);
    setError("");
    setMessage("");
    setProblems([]);
    setCounts({ import: 0, skip: 0, review: 0 });
    setPage(1);
    setSummary("");
  }

  async function previewList() {
    resetResult();
    const local = reviewedLocal(paste);
    if (local.error) {
      setError(local.error);
      return;
    }
    const localProblems = local.rows.filter((row) => row.result !== "import");
    const accepted = local.rows.filter((row) => row.result === "import");
    const parts = splitImportText(accepted.map((row) => [row.name, row.email, row.city, row.phone, row.source, row.notes].join(" | ")).join("\n"));
    const chunks = parts.error ? [] : parts.chunks;
    let imported = 0;
    let skipped = local.counts.skip;
    let review = local.counts.review;
    const found = [...localProblems];
    setBusy(`Checking ${chunks.length || 1} ${chunks.length === 1 ? "part" : "parts"}`);
    for (let index = 0; index < chunks.length; index += 1) {
      setBusy(`Checking part ${index + 1} of ${chunks.length}`);
      const formData = new FormData();
      formData.set("paste", chunks[index]);
      const result = await previewProspectImportAction({}, formData);
      if (result.error) {
        setBusy("");
        setError(result.error);
        return;
      }
      imported += result.counts?.import || 0;
      skipped += result.counts?.skip || 0;
      review += result.counts?.review || 0;
      for (const row of result.preview || []) {
        if (row.result !== "import") found.push(row);
      }
    }
    setCounts({ import: imported, skip: skipped, review });
    setProblems(found.slice(0, 200));
    setMessage(`${imported} can be imported, ${skipped} will be skipped, and ${review} need review. Nothing has been saved.`);
    setChecked(true);
    setBusy("");
  }

  async function importList() {
    if (!confirmed) {
      setError("Confirm the import before saving. Nothing was imported.");
      return;
    }
    setError("");
    setSummary("");
    const local = reviewedLocal(paste);
    if (local.error) {
      setError(local.error);
      return;
    }
    const accepted = local.rows.filter((row) => row.result === "import");
    const parts = splitImportText(accepted.map((row) => [row.name, row.email, row.city, row.phone, row.source, row.notes].join(" | ")).join("\n"));
    if (parts.error) {
      setError(parts.error);
      return;
    }
    let imported = 0;
    let skipped = local.counts.skip;
    let review = local.counts.review;
    let batchId = "";
    for (let index = 0; index < parts.chunks.length; index += 1) {
      setBusy(`Importing part ${index + 1} of ${parts.chunks.length}. No email is sent.`);
      const formData = new FormData();
      formData.set("paste", parts.chunks[index]);
      formData.set("confirmImport", "on");
      if (batchId) formData.set("batchId", batchId);
      const result = await importProspectListAction({}, formData);
      if (result.error) {
        setBusy("");
        setError(result.error);
        return;
      }
      imported += result.summary?.imported || 0;
      skipped += result.summary?.skipped || 0;
      review += result.summary?.review || 0;
      batchId = result.summary?.batchId || batchId;
    }
    setBusy("");
    setSummary(`Imported ${imported} as Pending research. Skipped ${skipped}. Review ${review}. Batch ${batchId}. No email was sent.`);
    setConfirmed(false);
  }

  const pageCount = Math.max(1, Math.ceil(problems.length / PAGE_SIZE));
  const visible = problems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="text-lg font-semibold text-ink">Paste prospect list</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        One business per line: Business Name | email@example.com. A table or CSV can also include city, phone, source URL, and notes. Importing saves Pending research and does not send email.
      </p>
      <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="prospect-paste">
        Businesses
        <textarea
          id="prospect-paste"
          value={paste}
          onChange={(event) => {
            setPaste(event.target.value);
            resetResult();
          }}
          rows={6}
          maxLength={2000000}
          disabled={unavailable || Boolean(busy)}
          placeholder={"Bob's Auto Body | office@example.com | Carlsbad | 575-555-0100 | https://example.com/listing | Notes"}
          className="mt-1 min-h-32 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-semibold text-ink" htmlFor="prospect-csv">
        CSV upload
        <input
          id="prospect-csv"
          type="file"
          accept=".csv,text/csv,text/plain"
          disabled={unavailable || Boolean(busy)}
          className="mt-1 block min-h-11 w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              setPaste(String(reader.result || ""));
              resetResult();
            };
            reader.readAsText(file);
          }}
        />
      </label>
      {unavailable ? <p className="mt-2 text-sm text-muted">Prospect tables are not available, so a list cannot be imported.</p> : null}
      <button
        type="button"
        onClick={previewList}
        disabled={unavailable || Boolean(busy) || !paste.trim()}
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy.startsWith("Checking") ? busy : "Preview list"}
      </button>
      {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}
      {checked ? (
        <p className="mt-2 text-sm text-muted">
          Will import {counts.import}. Will skip {counts.skip}. Needs review {counts.review}. A source URL is kept for research and is not saved as the business website.
        </p>
      ) : null}
      {visible.length ? (
        <>
          <ul className="mt-4 space-y-3">
            {visible.map((row) => (
              <li key={`${row.line}-${row.email}-${row.result}`} className="rounded-xl border border-black/10 px-3 py-3 text-sm">
                <p className="font-semibold text-ink">{row.name || "Missing name"}</p>
                <p className="mt-1 break-all">{row.email || "Missing email"}</p>
                {row.source ? <a className="mt-1 block break-all underline" href={row.source} target="_blank" rel="noreferrer">{row.source}</a> : <p className="mt-1 text-muted">No source link</p>}
                <p className="mt-2 font-semibold">{row.result === "import" ? "Will import" : row.result === "review" ? "Needs review" : "Will skip"}</p>
                <p className="mt-1 leading-relaxed text-muted">{row.message}</p>
                {row.matchId ? <a className="mt-1 inline-flex min-h-11 items-center underline" href={`/admin/prospects/${row.matchId}`}>Existing record</a> : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </>
      ) : null}
      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={!checked || counts.import < 1 || unavailable || Boolean(busy)}
        />
        Import the accepted rows as Pending research. This does not send an email.
      </label>
      <button
        type="button"
        onClick={importList}
        disabled={unavailable || Boolean(busy) || !checked || counts.import < 1 || !confirmed}
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy.startsWith("Importing") ? busy : "Import accepted rows"}
      </button>
      {summary ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">{summary}</p>
      ) : null}
    </div>
  );
}
