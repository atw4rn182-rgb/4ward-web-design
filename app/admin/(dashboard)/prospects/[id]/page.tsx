import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { ProspectEditor } from "@/components/admin/prospects/ProspectEditor";
import { ResearchPreview } from "@/components/admin/prospects/ResearchPreview";
import { ResearchProspectButton } from "@/components/admin/prospects/ResearchActions";
import { formatWhen } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/prospects/model.mjs";
import { getProspectDetail } from "@/lib/prospects/queries";

export const metadata = {
  title: "Prospect | 4Ward Admin",
  robots: { index: false, follow: false },
};

function researchedOn(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getProspectDetail(id);

  if (detail.missing) {
    return (
      <>
        <PageHeader title="Prospect" description="Research and status for one business." />
        <EmptyState
          title="Prospect tables are not available"
          detail="Review migration 011 before using this record."
        />
      </>
    );
  }

  const prospect = detail.prospect;
  if (!prospect) notFound();

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/prospects" className="font-semibold text-brand-deep">
          Prospective Clients
        </Link>
      </p>
      <PageHeader
        title={prospect.business_name}
        description={`${STATUS_LABELS[prospect.status as keyof typeof STATUS_LABELS] || prospect.status}. Unsubscribe token is stored for a later compliance page. No email is sent from here.`}
      />
      <ResearchProspectButton prospectId={prospect.id} />
      <ResearchPreview prospect={prospect} />
      <ProspectEditor prospect={prospect} researchedOn={researchedOn(prospect.researched_at)} />

      <section className="mt-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
        <h2 className="font-display text-lg font-bold">Activity</h2>
        <p className="mt-1 text-sm text-muted">Latest 20 events. Older operational notes can be cleaned up; opt-out history stays.</p>
        {detail.activity.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {detail.activity.map((event) => (
              <li key={event.id} className="border-b border-black/5 pb-3 text-sm last:border-0">
                <p className="font-semibold text-ink">
                  {event.to_status
                    ? `${event.from_status || "new"} → ${event.to_status}`
                    : event.event_type}
                </p>
                <p className="text-muted">{formatWhen(event.created_at)}</p>
                {event.note ? <p className="mt-1 leading-relaxed">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
