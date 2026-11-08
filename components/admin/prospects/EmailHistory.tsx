import { formatWhen } from "@/lib/format";
import { outreachHistory } from "@/lib/prospects/history.mjs";
import type { ProspectActivityRow, ProspectRow } from "@/lib/prospects/queries";

type HistoryEntry = {
  id: string;
  status: string;
  at: string;
  messageId: string;
  note: string;
  subject: string;
  body: string;
};

export function EmailHistory({
  prospect,
  activity,
  mailingAddress,
}: {
  prospect: ProspectRow;
  activity: ProspectActivityRow[];
  mailingAddress: string;
}) {
  const entries = outreachHistory(activity, prospect, mailingAddress) as HistoryEntry[];

  return (
    <section className="mt-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold">Email history</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Saved send records for this business. Opening this page does not send email, and Gmail’s inbox was not read.
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-black/15 px-4 py-6 text-sm text-muted">
          No outreach email has been recorded for this business.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-black/10 bg-white p-3 sm:p-4">
              <p className="font-semibold text-ink">{entry.status}</p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Recorded</dt>
                  <dd>{formatWhen(entry.at)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Gmail message ID</dt>
                  <dd className="break-all">{entry.messageId || "Not recorded"}</dd>
                </div>
              </dl>
              {entry.note ? <p className="mt-2 text-sm leading-relaxed text-ink">{entry.note}</p> : null}
              {entry.body ? (
                <div className="mt-3 rounded-xl bg-black/[0.03] p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Letter prepared from this record</p>
                  <p className="mt-2 text-sm font-semibold">{entry.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{entry.body}</pre>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Inbox delivery was not checked. This is the letter generated from the saved business details, not a copy retrieved from Gmail.
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
