import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminTableScroll } from "@/components/admin/AdminTableScroll";
import { AddBusinessForm } from "@/components/admin/prospects/AddBusinessForm";
import { OutreachSettingsForm } from "@/components/admin/prospects/OutreachSettingsForm";
import { ProspectFilters } from "@/components/admin/prospects/ProspectFilters";
import { formatWhen } from "@/lib/format";
import {
  countProspects,
  filterProspects,
  nextScheduledRun,
  OUTREACH_SCHEDULER_ACTIVE,
  sortProspects,
  STATUS_LABELS,
} from "@/lib/prospects/model.mjs";
import { getOutreachSettings, getProspects } from "@/lib/prospects/queries";

export const metadata = {
  title: "Prospective Clients | 4Ward Admin",
  robots: { index: false, follow: false },
};

function formatDenver(value: string | Date | null) {
  if (!value) return "Not scheduled";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status;
}

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const q = params.q || "";
  const status = params.status || "all";
  const [prospectsResult, settingsResult] = await Promise.all([
    getProspects(),
    getOutreachSettings(),
  ]);
  const schemaMissing = prospectsResult.missing || settingsResult.missing;
  const counts = countProspects(prospectsResult.data);
  const visible = sortProspects(filterProspects(prospectsResult.data, { q, status }));
  const nextRun = formatDenver(nextScheduledRun());

  return (
    <>
      <PageHeader
        title="Prospective Clients"
        description="Queue and review businesses for a future weekday outreach batch. Nothing on this page sends email."
      />

      {schemaMissing ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">Prospect tables are not in the database yet</p>
          <p className="mt-1 leading-relaxed">
            Review <code className="rounded bg-white px-1.5 py-0.5">supabase/migrations/011_prospective_clients.sql</code> and
            run it only after approval. Counts stay at zero until then.
          </p>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total prospects" value={String(counts.total)} hint="Every business in the queue" />
        <StatCard label="Awaiting research" value={String(counts.awaitingResearch)} hint="Queued or researching" />
        <StatCard label="Ready to contact" value={String(counts.ready)} hint="Reviewed and eligible" />
        <StatCard label="Emails sent" value={String(counts.emailsSent)} hint="Submitted in a future phase" />
        <StatCard label="Interested prospects" value={String(counts.interested)} hint="Positive replies" />
        <StatCard label="Not interested / opted out" value={String(counts.optedOut)} hint="Kept on the suppression list" />
        <StatCard label="Failed or bounced" value={String(counts.failed)} hint="Needs review before any retry" />
      </div>

      <div className="mb-5">
        <OutreachSettingsForm
          settings={settingsResult.data}
          nextRun={nextRun}
          schedulerActive={OUTREACH_SCHEDULER_ACTIVE}
        />
      </div>

      <AddBusinessForm />
      <ProspectFilters q={q} status={status} />

      {visible.length === 0 ? (
        <EmptyState
          title={q || status !== "all" ? "No matching prospects" : "No prospects yet"}
          detail={
            schemaMissing
              ? "The list will appear after the migration is approved and applied."
              : "Add a business to give it priority in the next scheduled batch."
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {visible.map((row) => (
              <li key={row.id} className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/prospects/${row.id}`} className="font-semibold text-ink">
                      {row.business_name}
                    </Link>
                    <p className="mt-1 text-sm text-muted">{row.city || row.service_area || "Location not recorded"}</p>
                  </div>
                  <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                    {statusLabel(row.status)}
                  </span>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Contact</dt>
                    <dd className="text-right">{row.public_email || "Not recorded"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Website</dt>
                    <dd className="truncate text-right">{row.website_host || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Last activity</dt>
                    <dd>{formatWhen(row.last_activity_at)}</dd>
                  </div>
                </dl>
                {row.manual_priority ? (
                  <p className="mt-2 text-xs font-semibold text-brand-deep">Manual priority</p>
                ) : null}
                {row.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted">{row.notes}</p> : null}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <AdminTableScroll>
              <table className="min-w-[880px] w-full text-left text-sm">
                <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Business</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Website</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last activity</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className="border-b border-black/5 align-top">
                      <td className="px-4 py-3">
                        <Link href={`/admin/prospects/${row.id}`} className="font-semibold text-ink">
                          {row.business_name}
                        </Link>
                        {row.manual_priority ? (
                          <p className="mt-1 text-xs font-semibold text-brand-deep">Priority</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{row.city || row.service_area || "—"}</td>
                      <td className="px-4 py-3">{row.public_email || row.secondary_email || "Not recorded"}</td>
                      <td className="px-4 py-3">{row.website_host || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatWhen(row.last_activity_at)}</td>
                      <td className="max-w-xs px-4 py-3 text-muted">{row.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
        </>
      )}
    </>
  );
}
