import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Dashboard | 4Ward Admin",
  robots: { index: false, follow: false },
};

const STATS = [
  {
    label: "Active clients",
    value: "18",
    hint: "Companies currently on a monthly plan",
    trend: "+3 this month",
  },
  {
    label: "Open projects",
    value: "7",
    hint: "Sites in design, development, or review",
    trend: "2 launching soon",
  },
  {
    label: "Monthly revenue",
    value: "$4,860",
    hint: "Placeholder total from active subscriptions",
    trend: "+8%",
  },
  {
    label: "Pending onboarding",
    value: "4",
    hint: "New submissions waiting for review",
  },
];

const ACTIVITY = [
  { title: "Accu-Fab NM", detail: "Project moved to review", time: "2h ago" },
  { title: "Black Mesa Welding", detail: "Payment received — Tier 2", time: "Yesterday" },
  { title: "Desert Peak HVAC", detail: "Onboarding form submitted", time: "Yesterday" },
  { title: "Carlsbad Cafe Co.", detail: "Logo file uploaded", time: "2 days ago" },
];

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of clients, projects, and revenue. Stats below use placeholder data until live Supabase records are connected."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-5">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft lg:col-span-3">
          <h2 className="font-display text-lg font-bold tracking-tight">
            Recent activity
          </h2>
          <ul className="mt-4 divide-y divide-black/5">
            {ACTIVITY.map((item) => (
              <li
                key={item.title + item.time}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted">
                  {item.time}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft lg:col-span-2">
          <h2 className="font-display text-lg font-bold tracking-tight">
            Pipeline snapshot
          </h2>
          <div className="mt-4 space-y-3">
            {[
              { label: "Leads", value: "9", width: "55%" },
              { label: "In design", value: "3", width: "35%" },
              { label: "In development", value: "2", width: "25%" },
              { label: "Live", value: "12", width: "70%" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-ink">{row.label}</span>
                  <span className="text-muted">{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-deep to-brand-copper"
                    style={{ width: row.width }}
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
