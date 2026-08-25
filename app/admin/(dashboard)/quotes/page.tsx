import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
import { AdminTableScroll } from "@/components/admin/AdminTableScroll";
import { DeleteRecordButton } from "@/components/admin/DeleteRecordButton";
import { QUOTE_STATUSES, quotePaymentStatusLabel, quoteStatusLabel } from "@/lib/quotes/statuses";
import { formatMoney, formatWhen, getQuoteRequests } from "@/lib/supabase/queries";

export const metadata = {
  title: "Quote Requests | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const { data: quotes, missing } = await getQuoteRequests(
    statusFilter === "all" ? undefined : statusFilter
  );

  const newQuotes = quotes.filter((row) => row.status === "new").length;
  const openQuotes = quotes.filter((row) =>
    ["reviewing", "quote_preparing", "quote_sent", "awaiting_payment"].includes(row.status)
  ).length;
  const paidQuotes = quotes.filter((row) => row.status === "paid" || row.payment_status === "paid").length;

  return (
    <div>
      <PageHeader
        title="Quote requests"
        description="Manage custom work quotes separately from fixed-tier website onboarding. Delete any individual quote after confirming."
      />
      {missing ? <SchemaNotice /> : null}

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total quotes" value={String(quotes.length)} hint="All custom quote records" />
        <StatCard label="New" value={String(newQuotes)} hint="Awaiting first review" />
        <StatCard label="Open pipeline" value={String(openQuotes)} hint="Review through awaiting payment" />
        <StatCard label="Paid" value={String(paidQuotes)} hint="Payment received or marked paid" />
      </section>

      <section className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch]">
        <Link
          href="/admin/quotes"
          className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 py-2 text-xs font-semibold transition ${
            statusFilter === "all"
              ? "bg-brand-blue text-white"
              : "bg-black/[0.04] text-ink hover:bg-black/[0.08]"
          }`}
        >
          All
        </Link>
        {QUOTE_STATUSES.map((status) => (
          <Link
            key={status.value}
            href={`/admin/quotes?status=${status.value}`}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              statusFilter === status.value
                ? "bg-brand-blue text-white"
                : "bg-black/[0.04] text-ink hover:bg-black/[0.08]"
            }`}
          >
            {status.label}
          </Link>
        ))}
      </section>

      {quotes.length === 0 ? (
        <EmptyState
          title="No quote requests yet"
          detail="Custom quote submissions will appear here when saved to Supabase."
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {quotes.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{row.contact_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {row.company_name || row.email}
                      {row.phone ? ` · ${row.phone}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {quoteStatusLabel(row.status)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Service</dt>
                    <dd className="text-right font-medium text-ink">{row.service}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Quoted</dt>
                    <dd className="font-medium text-ink">
                      {row.quoted_amount_cents != null
                        ? formatMoney(row.quoted_amount_cents, row.currency)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Payment</dt>
                    <dd className="text-right">
                      <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                        {quotePaymentStatusLabel(row.payment_status || "none")}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Submitted</dt>
                    <dd className="text-ink">{formatWhen(row.created_at)}</dd>
                  </div>
                </dl>
                {row.last_email_error ? (
                  <p className="mt-2 text-xs font-medium text-amber-800">Email failed</p>
                ) : null}
                <div className="mt-4 grid gap-2">
                  <Link
                    href={`/admin/quotes/${row.id}`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-deep"
                  >
                    Manage quote
                  </Link>
                  <DeleteRecordButton
                    kind="quote"
                    id={row.id}
                    label={`${row.contact_name} · ${row.email}`}
                    detail={`${row.service} · ${quoteStatusLabel(row.status)} · ${formatWhen(row.created_at)}`}
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <AdminTableScroll>
              <table className="min-w-[1080px] w-full text-left text-sm">
                <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Quoted</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {quotes.map((row) => (
                    <tr key={row.id} className="hover:bg-black/[0.02]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{row.contact_name}</p>
                        <p className="text-xs text-muted">
                          {row.company_name || row.email}
                          {row.phone ? ` · ${row.phone}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-ink">{row.service}</td>
                      <td className="px-4 py-3 text-muted">{row.quantity || "—"}</td>
                      <td className="px-4 py-3 text-ink">
                        {row.quoted_amount_cents != null
                          ? formatMoney(row.quoted_amount_cents, row.currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          {quoteStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                          {quotePaymentStatusLabel(row.payment_status || "none")}
                        </span>
                        {row.last_email_error ? (
                          <p className="mt-1 text-xs font-medium text-amber-800">Email failed</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatWhen(row.created_at)}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col items-stretch gap-2">
                          <Link
                            href={`/admin/quotes/${row.id}`}
                            className="inline-flex min-h-10 items-center justify-center text-sm font-semibold text-brand-deep underline-offset-2 hover:underline"
                          >
                            Manage
                          </Link>
                          <DeleteRecordButton
                            kind="quote"
                            id={row.id}
                            label={`${row.contact_name} · ${row.email}`}
                            detail={`${row.service} · ${quoteStatusLabel(row.status)} · ${formatWhen(row.created_at)}`}
                            compact
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
        </>
      )}
    </div>
  );
}
