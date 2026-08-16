import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
import { getCustomers, getOnboardings, labelStatus } from "@/lib/supabase/queries";

export const metadata = {
  title: "Clients | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function ClientsPage() {
  const [customersResult, onboardingsResult] = await Promise.all([
    getCustomers(),
    getOnboardings(),
  ]);
  const customers = customersResult.data;
  const onboardings = onboardingsResult.data;
  const schemaMissing = customersResult.missing || onboardingsResult.missing;

  const latestTier = new Map<string, string>();
  for (const row of onboardings) {
    const key = (row.email || row.company_name || "").toLowerCase();
    if (key && !latestTier.has(key)) latestTier.set(key, row.tier);
  }

  const active = customers.filter((row) => row.status === "active").length;
  const leads = customers.filter((row) => row.status === "lead").length;

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Live customer records from Supabase, including portfolio clients with no Stripe subscription."
      />
      {schemaMissing ? <SchemaNotice /> : null}
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total clients" value={String(customers.length)} hint="All statuses" />
        <StatCard label="Active" value={String(active)} hint="Currently marked active" />
        <StatCard label="Leads" value={String(leads)} hint="Awaiting kickoff" />
      </section>
      {customers.length === 0 ? (
        <EmptyState
          title="No clients yet"
          detail="When a customer finishes onboarding, they will appear in this list."
        />
      ) : (
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
              {customers.map((row) => {
                const key = (row.email || row.company_name || "").toLowerCase();
                return (
                  <tr key={row.id} className="hover:bg-black/[0.02]">
                    <td className="px-4 py-3 font-semibold text-ink">{row.company_name}</td>
                    <td className="px-4 py-3 text-muted">{row.contact_name || row.email || "—"}</td>
                    <td className="px-4 py-3 text-muted">{latestTier.get(key) || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                        {labelStatus(row.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
