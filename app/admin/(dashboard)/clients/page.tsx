import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Clients | 4Ward Admin",
  robots: { index: false, follow: false },
};

const CLIENTS = [
  { company: "Accu-Fab NM", contact: "Maria Lopez", tier: "Tier 2", status: "Active" },
  { company: "Black Mesa Welding", contact: "James Ortiz", tier: "Tier 3", status: "Active" },
  { company: "Desert Peak HVAC", contact: "Tina Reed", tier: "Tier 1", status: "Onboarding" },
  { company: "Carlsbad Cafe Co.", contact: "Sam Nguyen", tier: "Tier 2", status: "Active" },
];

export default function ClientsPage() {
  return (
    <div>
      <PageHeader
        title="Clients"
        description="Customer accounts and contacts. Placeholder rows shown until the customers table is populated."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total clients" value="18" hint="All statuses" />
        <StatCard label="Active" value="14" hint="Currently billed monthly" trend="+2" />
        <StatCard label="Leads" value="4" hint="Awaiting kickoff" />
      </section>
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-paper shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Tier</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {CLIENTS.map((row) => (
              <tr key={row.company} className="hover:bg-black/[0.02]">
                <td className="px-4 py-3 font-semibold text-ink">{row.company}</td>
                <td className="px-4 py-3 text-muted">{row.contact}</td>
                <td className="px-4 py-3 text-muted">{row.tier}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
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
