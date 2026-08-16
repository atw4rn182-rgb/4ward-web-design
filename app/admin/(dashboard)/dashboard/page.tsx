import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
import {
  formatMoney,
  formatWhen,
  getCustomers,
  getOnboardings,
  getPayments,
  getProjects,
  labelStatus,
} from "@/lib/supabase/queries";

export const metadata = {
  title: "Dashboard | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const [customers, projects, payments, onboardings] = await Promise.all([
    getCustomers(),
    getProjects(),
    getPayments(),
    getOnboardings(),
  ]);

  const activeClients = customers.data.filter((row) => row.status === "active").length;
  const openProjects = projects.data.filter(
    (row) => !["live", "archived"].includes(row.status)
  ).length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthlyRevenue = payments.data
    .filter((row) => row.status === "paid" && new Date(row.created_at).getTime() >= monthStart)
    .reduce((sum, row) => sum + (row.amount_cents || 0), 0);
  const pendingOnboarding = onboardings.data.filter((row) => row.status === "received").length;

  const activity = [
    ...onboardings.data.slice(0, 6).map((row) => ({
      id: `onboarding-${row.id}`,
      title: row.company_name || row.email || "Onboarding",
      detail: `Onboarding ${labelStatus(row.status)} · ${row.tier}`,
      at: row.created_at,
    })),
    ...payments.data.slice(0, 6).map((row) => ({
      id: `payment-${row.id}`,
      title: formatMoney(row.amount_cents, row.currency),
      detail: `${labelStatus(row.payment_type)} · ${labelStatus(row.status)}`,
      at: row.created_at,
    })),
    ...projects.data.slice(0, 6).map((row) => ({
      id: `project-${row.id}`,
      title: row.name,
      detail: `Project ${labelStatus(row.status)}`,
      at: row.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  const leadCount = customers.data.filter((row) => row.status === "lead").length;
  const designCount = projects.data.filter((row) => row.status === "design").length;
  const devCount = projects.data.filter((row) => row.status === "development").length;
  const liveCount = projects.data.filter((row) => row.status === "live").length;
  const pipelineMax = Math.max(leadCount, designCount, devCount, liveCount, 1);

  const schemaMissing =
    customers.missing || projects.missing || payments.missing || onboardings.missing;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live counts from your Supabase customer, project, payment, and onboarding tables."
      />
      {schemaMissing ? <SchemaNotice /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active clients"
          value={String(activeClients)}
          hint="Companies currently marked active"
        />
        <StatCard
          label="Open projects"
          value={String(openProjects)}
          hint="Sites not yet live or archived"
        />
        <StatCard
          label="Monthly revenue"
          value={formatMoney(monthlyRevenue)}
          hint="Paid payments since the start of this month"
        />
        <StatCard
          label="Pending onboarding"
          value={String(pendingOnboarding)}
          hint="Submissions waiting for review"
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-5">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft lg:col-span-3">
          <h2 className="font-display text-lg font-bold tracking-tight">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No activity yet"
                detail="New onboarding, payments, and projects will show up here."
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-black/5">
              {activity.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted">
                    {formatWhen(item.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft lg:col-span-2">
          <h2 className="font-display text-lg font-bold tracking-tight">
            Pipeline snapshot
          </h2>
          <div className="mt-4 space-y-3">
            {[
              { label: "Leads", value: leadCount },
              { label: "In design", value: designCount },
              { label: "In development", value: devCount },
              { label: "Live", value: liveCount },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-ink">{row.label}</span>
                  <span className="text-muted">{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-deep to-brand-copper"
                    style={{ width: `${Math.round((row.value / pipelineMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
