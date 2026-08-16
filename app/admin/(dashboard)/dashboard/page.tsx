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

  const activeClientsList = customers.data.filter((row) => row.status === "active");
  const activeClients = activeClientsList.length;
  const openProjects = projects.data.filter(
    (row) => !["live", "archived"].includes(row.status)
  ).length;
  const liveProjects = projects.data.filter((row) => row.status === "live");
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

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold tracking-tight">Active clients</h2>
          {activeClientsList.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No active clients"
                detail="Active customer records will appear here."
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-black/5">
              {activeClientsList.map((client) => (
                <li key={client.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{client.company_name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {client.contact_name || client.email || "Active client"}
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                    Active
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold tracking-tight">Live sites</h2>
          {liveProjects.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No live projects"
                detail="Launched website projects will appear here."
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-black/5">
              {liveProjects.map((project) => (
                <li key={project.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{project.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {project.live_url ? (
                        <a
                          href={project.live_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-deep underline-offset-2 hover:underline"
                        >
                          {project.live_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        "Live project"
                      )}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    Live
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
