import { qualificationLabel, readResearchRecord, sourceLinks } from "@/lib/prospects/research.mjs";
import type { ProspectRow } from "@/lib/prospects/queries";

export function ResearchPreview({ prospect }: { prospect: ProspectRow }) {
  const record = readResearchRecord(prospect);
  const links = sourceLinks(record.sources);
  const label = qualificationLabel(record.qualification);

  return (
    <section className="mb-4 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold">Research result</h2>
      {label ? (
        <p className="mt-3 inline-flex rounded-full bg-brand-blue/10 px-3 py-1 text-sm font-semibold text-brand-deep">{label}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">No research result has been saved yet.</p>
      )}
      {record.summary ? <p className="mt-3 text-sm leading-relaxed text-ink">{record.summary}</p> : null}
      {links.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {links.map((href) => (
            <li key={href} className="truncate">
              <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-deep">
                {href}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {record.draftBody ? (
        <div className="mt-4 rounded-xl bg-black/[0.03] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Unsent draft</p>
          <p className="mt-2 text-sm font-semibold">{record.draftSubject}</p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{record.draftBody}</pre>
        </div>
      ) : null}
    </section>
  );
}
