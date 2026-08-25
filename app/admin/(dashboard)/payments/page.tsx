import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminTableScroll } from "@/components/admin/AdminTableScroll";
import { DeleteRecordButton, TestRecordBadge } from "@/components/admin/DeleteRecordButton";
import {
  formatMoney,
  getPayments,
  labelStatus,
  relatedCompany,
} from "@/lib/supabase/queries";
import { isDisposablePayment } from "@/lib/admin/disposable-records";

export const metadata = {
  title: "Payments | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function PaymentsPage() {
  const { data: payments } = await getPayments();
  const allowProductionDelete =
    String(process.env.ADMIN_ALLOW_PRODUCTION_DELETE || "").toLowerCase() === "true";
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
        description="Live payment rows from Superbase. Checkout creates a pending row; Stripe webhooks mark it paid. Test and verification rows can be deleted safely."
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
            {payments.map((row) => {
              const disposable = isDisposablePayment(row);
              return (
                <article
                  key={row.id}
                  className={`rounded-2xl border bg-paper p-4 shadow-soft ${
                    disposable ? "border-amber-200" : "border-black/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{relatedCompany(row.customers)}</p>
                      <p className="mt-0.5 text-sm text-muted">{labelStatus(row.payment_type)}</p>
                      {disposable ? (
                        <div className="mt-2">
                          <TestRecordBadge label="Test / verification" />
                        </div>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {labelStatus(row.status)}
                    </span>
                  </div>
                  <p className="mt-3 font-display text-xl font-bold text-ink">
                    {formatMoney(row.amount_cents, row.currency)}
                  </p>
                  {row.description ? (
                    <p className="mt-1 truncate text-xs text-muted">{row.description}</p>
                  ) : null}
                  <div className="mt-4">
                    <DeleteRecordButton
                      kind="payment"
                      id={row.id}
                      label={`${relatedCompany(row.customers)} · ${formatMoney(row.amount_cents, row.currency)}`}
                      disposable={disposable}
                      allowProductionDelete={allowProductionDelete}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden md:block">
            <AdminTableScroll>
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {payments.map((row) => {
                    const disposable = isDisposablePayment(row);
                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-black/[0.02] ${disposable ? "bg-amber-50/40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold">{relatedCompany(row.customers)}</p>
                          {disposable ? (
                            <div className="mt-1">
                              <TestRecordBadge label="Test / verification" />
                            </div>
                          ) : null}
                          {row.description ? (
                            <p className="mt-1 max-w-xs truncate text-xs text-muted">{row.description}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatMoney(row.amount_cents, row.currency)}
                        </td>
                        <td className="px-4 py-3 text-muted">{labelStatus(row.payment_type)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {labelStatus(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <DeleteRecordButton
                            kind="payment"
                            id={row.id}
                            label={`${relatedCompany(row.customers)} · ${formatMoney(row.amount_cents, row.currency)}`}
                            disposable={disposable}
                            allowProductionDelete={allowProductionDelete}
                            compact
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
        </>
      )}
    </div>
  );
}
