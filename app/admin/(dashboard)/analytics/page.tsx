import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { getOnboardings, getProjects, relatedCompany } from "@/lib/supabase/queries";

export const metadata = {
  title: "Analytics | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function AnalyticsPage() {
  const [{ data: onboardings }, { data: projects }] = await Promise.all([
    getOnboardings(),
    getProjects(),
  ]);

  const now = Date.now();
  const thirtyDays = 1000 * 60 * 60 * 24 * 30;
  const recentOnboarding = onboardings.filter(
    (row) => now - new Date(row.created_at).getTime() <= thirtyDays
  ).length;
  const liveSites = projects.filter((row) => row.status === "live" && row.live_url);

  const weeks = Array.from({ length: 12 }, (_, index) => {
    const end = new Date();
    end.setDate(end.getDate() - (11 - index) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return onboardings.filter((row) => {
      const t = new Date(row.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
  });
  const maxWeek = Math.max(...weeks, 1);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Counts from your own onboarding and project records. Site-visit tracking is not connected yet, so those values stay at zero."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Site visits" value="0" hint="Google Analytics is not connected" />
        <StatCard
          label="Onboarding requests"
          value={String(recentOnboarding)}
          hint="Last 30 days"
        />
        <StatCard label="Conversion rate" value="—" hint="Needs visit tracking" />
        <StatCard label="Avg session" value="—" hint="Needs visit tracking" />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Onboarding trend</h2>
          <div className="mt-6 flex h-40 items-end gap-2">
            {weeks.map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-brand-deep to-brand-copper/80"
                style={{ height: `${Math.max(6, Math.round((count / maxWeek) * 100))}%` }}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">Live onboarding counts · last 12 weeks</p>
        </article>
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Live client sites</h2>
          {liveSites.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No live URLs yet"
                detail="Projects marked live with a URL will appear here."
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {liveSites.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2.5 text-sm"
                >
                  <span className="font-semibold">{row.live_url}</span>
                  <span className="text-muted">{relatedCompany(row.customers)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </div>
  );
}
