import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { formatWhen, getNotes, relatedCompany } from "@/lib/supabase/queries";

export const metadata = {
  title: "Messages | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const { data: notes } = await getNotes();

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Notes stored in Supabase. This is not a live email inbox."
      />
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Notes" value={String(notes.length)} hint="Saved in the notes table" />
        <StatCard label="Open threads" value="0" hint="Inbox integration is not connected yet" />
        <StatCard label="Avg reply time" value="—" hint="No message timing data yet" />
      </section>
      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          detail="Client notes will appear here when they are added in Supabase."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <article
              key={note.id}
              className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {relatedCompany(note.customers)}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted">{note.body}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted">
                  {formatWhen(note.created_at)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
