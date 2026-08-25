import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminTableScroll } from "@/components/admin/AdminTableScroll";
import {
  formatMoney,
  getPayments,
  labelStatus,
  relatedCompany,
} from "@/lib/supabase/queries";

export const metadata = {
  title: "Payments | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function PaymentsPage() {
  const { data: payments } = await getPayments();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const collected = payments
    .filter((row) => row.status === "paid" && new Date(row.created_at).getTime() >= monthStart)
    .reduce((sum, row) => sum + row.amount_cents, 0);
  const pending = payments
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.amount_cents, 0);
  const failed = payments.filter((row) => row.status === "failed").length;

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Live payment rows from Superbase. Checkout creates a pending row; Stripe webhooks mark it paid."
      />
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Collected (MTD)" value={formatMoney(collected)} hint="Paid this month" />
        <StatCard label="Pending" value={formatMoney(pending)} hint="Awaiting settlement" />
        <StatCard label="Failed" value={String(failed)} hint="Failed charges" />
      </section>
      {payments.length === 0 ? (
        <EmptyState
          title="No payments yet"
          detail="Successful checkouts will appear here once they are written to the payments table."
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {payments.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{relatedCompany(row.customers)}</p>
                    <p className="mt-0.5 text-sm text-muted">{labelStatus(row.payment_type)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {labelStatus(row.status)}
                  </span>
                </div>
                <p className="mt-3 font-display text-xl font-bold text-ink">
                  {formatMoney(row.amount_cents, row.currency)}
                </p>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <AdminTableScroll>
              <table className="min-w-[560px] w-full text-left text-sm">
                <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {payments.map((row) => (
                    <tr key={row.id} className="hover:bg-black/[0.02]">
                      <td className="px-4 py-3 font-semibold">{relatedCompany(row.customers)}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatMoney(row.amount_cents, row.currency)}
                      </td>
                      <td className="px-4 py-3 text-muted">{labelStatus(row.payment_type)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {labelStatus(row.status)}
                        </span>
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
