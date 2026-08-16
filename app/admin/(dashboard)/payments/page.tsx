import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
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
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
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
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-paper shadow-soft">
          <table className="min-w-full text-left text-sm">
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
        </div>
      )}
    </div>
  );
}
