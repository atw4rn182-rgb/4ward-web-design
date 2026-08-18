import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
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
        description="Manage custom work quotes separately from fixed-tier website onboarding."
      />
      {missing ? <SchemaNotice /> : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total quotes" value={String(quotes.length)} hint="All custom quote records" />
        <StatCard label="New" value={String(newQuotes)} hint="Awaiting first review" />
        <StatCard label="Open pipeline" value={String(openQuotes)} hint="Review through awaiting payment" />
        <StatCard label="Paid" value={String(paidQuotes)} hint="Payment received or marked paid" />
      </section>

      <section className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/quotes"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
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
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
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
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-paper shadow-soft">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Service</th>
                <th className="px-4 py-3 font-semibold">Qty</th>
                <th className="px-4 py-3 font-semibold">Quoted</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold"></th>
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
                  </td>
                  <td className="px-4 py-3 text-muted">{formatWhen(row.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/quotes/${row.id}`}
                      className="text-sm font-semibold text-brand-deep underline-offset-2 hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
