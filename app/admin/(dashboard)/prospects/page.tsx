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
  listWindow,
  nextScheduledRun,
  OUTREACH_SCHEDULER_ACTIVE,
  sanitizeSearch,
  STATUS_LABELS,
  sumRecentWrites,
} from "@/lib/prospects/model.mjs";
import { getProspectDashboard } from "@/lib/prospects/queries";
import { UsagePanel } from "@/components/admin/prospects/UsagePanel";
import { ResearchQueueButton } from "@/components/admin/prospects/ResearchActions";
import { ProspectDecision } from "@/components/admin/prospects/ProspectDecision";
import { listQualification } from "@/lib/prospects/research.mjs";
import { GmailConnection } from "@/components/admin/prospects/GmailConnection";
import { AuthorizedLaunch } from "@/components/admin/prospects/AuthorizedLaunch";
import { gmailConnectionStatus } from "@/lib/gmail/mailbox.mjs";

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

function pageHref(q: string, status: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/prospects?${query}` : "/admin/prospects";
}

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; gmail?: string }>;
}) {
  const params = await searchParams;
  const q = sanitizeSearch(params.q || "");
  const status = params.status || "all";
  const window = listWindow(params.page);
  const [dashboard, mailbox] = await Promise.all([
    getProspectDashboard({ q, status, offset: window.offset }),
    gmailConnectionStatus(),
  ]);
  const schemaMissing = dashboard.missing;
  const counts = dashboard.data.counts;
  const visible = dashboard.data.rows;
  const pageCount = Math.max(1, Math.ceil(dashboard.data.total / dashboard.data.limit));
  const currentPage = Math.min(window.page, pageCount);
  const nextRun = formatDenver(nextScheduledRun());

  return (
    <>
      <PageHeader
        title="Prospective Clients"
        description="Queue and review businesses for outreach. Weekday batches send at 9:00 AM America/Denver. An administrator can also send a sample that goes only to 4wardwebdesigns@gmail.com."
      />

      {schemaMissing ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">Prospect tables are not in the database yet</p>
          <p className="mt-1 leading-relaxed">
            The prospect tables are not available yet. Review migration 011 before using this page.
          </p>
        </div>
      ) : null}

      {dashboard.error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
          <p className="font-semibold">The prospect list could not be loaded</p>
          <p className="mt-1 leading-relaxed">{dashboard.error}</p>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total prospects" value={String(counts.total)} hint="Every business in the queue" href={`${pageHref(q, "all", 1)}#prospect-list`} current={status === "all" && !q} />
        <StatCard label="Awaiting research" value={String(counts.awaitingResearch)} hint="Queued or researching" href={`${pageHref(q, "awaiting", 1)}#prospect-list`} current={status === "awaiting"} />
        <StatCard label="Ready to contact" value={String(counts.ready)} hint="Reviewed and eligible" href={`${pageHref(q, "ready", 1)}#prospect-list`} current={status === "ready"} />
        <StatCard label="Emails sent" value={String(counts.emailsSent)} hint="Accepted by Gmail or marked sent" href={`${pageHref(q, "contacted", 1)}#prospect-list`} current={status === "contacted"} />
        <StatCard label="Interested prospects" value={String(counts.interested)} hint="Positive replies" href={`${pageHref(q, "interested", 1)}#prospect-list`} current={status === "interested"} />
        <StatCard label="Not interested / opted out" value={String(counts.optedOut)} hint="Kept on the suppression list" href={`${pageHref(q, "opted_out", 1)}#prospect-list`} current={status === "opted_out"} />
        <StatCard label="Failed or bounced" value={String(counts.failed)} hint="Needs review before any retry" href={`${pageHref(q, "needs_review", 1)}#prospect-list`} current={status === "needs_review"} />
      </div>

      <div className="mb-5">
        <GmailConnection
          connected={mailbox.connected}
          email={mailbox.email}
          pendingMigration={mailbox.pendingMigration}
          configured={mailbox.configured}
          notice={params.gmail || ""}
          addressSaved={Boolean(String(dashboard.data.settings?.mailing_address || "").trim())}
        />
      </div>

      <AuthorizedLaunch />

      <div className="mb-5">
        <OutreachSettingsForm
          key={`${dashboard.data.settings?.weekday_target ?? 5}-${dashboard.data.settings?.automation_enabled ? "on" : "off"}`}
          settings={dashboard.data.settings}
          nextRun={nextRun}
          schedulerActive={OUTREACH_SCHEDULER_ACTIVE}
          interestedLeads={counts.interested}
          readyCount={counts.ready}
        />
      </div>

      <UsagePanel
        requests={dashboard.requests}
        totalProspects={counts.total}
        recentWrites={sumRecentWrites(dashboard.data.usage)}
        usage={dashboard.data.usage}
        lastRun={dashboard.data.settings?.last_run_at ? formatDenver(dashboard.data.settings.last_run_at) : "No runs yet"}
        lastCleanup={dashboard.data.settings?.last_cleanup_at ? formatDenver(dashboard.data.settings.last_cleanup_at) : "Not run"}
        unavailable={schemaMissing}
      />

      <ResearchQueueButton awaiting={counts.awaitingResearch} unavailable={schemaMissing} />
      <AddBusinessForm unavailable={schemaMissing} />
      <div id="prospect-list">
        <ProspectFilters q={q} status={status} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={dashboard.error ? "Prospects are unavailable" : q || status !== "all" ? "No matching prospects" : "No prospects yet"}
          detail={
            dashboard.error
              ? "Refresh this page after the connection recovers. Nothing was sent."
              : schemaMissing
              ? "The list will appear after the migration is approved and applied."
              : status !== "all"
                ? "No saved business matches this status. Choose another card or clear the filter."
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
                    <Link href={`/admin/prospects/${row.id}`} className="inline-flex min-h-11 items-center font-semibold text-ink">
                      {row.business_name}
                    </Link>
                    <p className="mt-1 text-sm text-muted">{row.city || row.service_area || "Location not recorded"}</p>
                  </div>
                  <Link href={`${pageHref("", row.status, 1)}#prospect-list`} className="inline-flex min-h-11 items-center">
                    <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                      {statusLabel(row.status)}
                    </span>
                  </Link>
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
                {listQualification(row.research_notes) ? (
                  <p className="mt-2 text-xs font-semibold text-ink">{listQualification(row.research_notes)}</p>
                ) : null}
                {row.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted">{row.notes}</p> : null}
                <ProspectDecision id={row.id} />
                <Link href={`/admin/prospects/${row.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-deep">
                  View details
                </Link>
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
                        <Link href={`/admin/prospects/${row.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-deep">
                          View details
                        </Link>
                        {row.manual_priority ? (
                          <p className="mt-1 text-xs font-semibold text-brand-deep">Priority</p>
                        ) : null}
                        {listQualification(row.research_notes) ? (
                          <p className="mt-1 text-xs text-muted">{listQualification(row.research_notes)}</p>
                        ) : null}
                        <ProspectDecision id={row.id} />
                      </td>
                      <td className="px-4 py-3">{row.city || row.service_area || "—"}</td>
                      <td className="px-4 py-3">{row.public_email || "Not recorded"}</td>
                      <td className="px-4 py-3">{row.website_host || "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`${pageHref("", row.status, 1)}#prospect-list`} className="inline-flex min-h-11 items-center">
                          <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                            {statusLabel(row.status)}
                          </span>
                        </Link>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {dashboard.data.total === 0
            ? "No rows in this view"
            : `Showing ${dashboard.data.offset + 1}–${Math.min(dashboard.data.offset + visible.length, dashboard.data.total)} of ${dashboard.data.total}`}
        </p>
        <div className="flex gap-2">
          <Link
            href={pageHref(q, status, currentPage)}
            className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 font-semibold"
          >
            Refresh
          </Link>
          {currentPage > 1 ? (
            <Link
              href={pageHref(q, status, currentPage - 1)}
              className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 font-semibold"
            >
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 font-semibold text-muted" title="Already on the first page">
              Previous
            </span>
          )}
          {currentPage < pageCount ? (
            <Link
              href={pageHref(q, status, currentPage + 1)}
              className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 font-semibold"
            >
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 font-semibold text-muted" title="Already on the last page">
              Next
            </span>
          )}
        </div>
      </div>
    </>
  );
}
