import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Payments | 4Ward Admin",
  robots: { index: false, follow: false },
};

const PAYMENTS = [
  { client: "Accu-Fab NM", amount: "$225.00", type: "Subscription", status: "Paid" },
  { client: "Black Mesa Welding", amount: "$399.00", type: "Subscription", status: "Paid" },
  { client: "Desert Peak HVAC", amount: "$99.00", type: "Subscription", status: "Pending" },
  { client: "Cafe Co.", amount: "$50.00", type: "GBP setup", status: "Paid" },
];

export default function PaymentsPage() {
  return (
    <div>
      <PageHeader
        title="Payments"
        description="Stripe-linked payment records. Values below are placeholders for layout and UX."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Collected (MTD)" value="$3,240" hint="Placeholder" trend="+12%" />
        <StatCard label="Pending" value="$297" hint="Awaiting settlement" />
        <StatCard label="Failed" value="0" hint="No failed charges this week" />
      </section>
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
            {PAYMENTS.map((row) => (
              <tr key={row.client + row.amount} className="hover:bg-black/[0.02]">
                <td className="px-4 py-3 font-semibold">{row.client}</td>
                <td className="px-4 py-3 text-muted">{row.amount}</td>
                <td className="px-4 py-3 text-muted">{row.type}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
