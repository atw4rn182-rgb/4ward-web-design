import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Analytics | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="Analytics"
        description="High-level performance view with placeholder summary stats and chart cards."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Site visits" value="12.4k" hint="Last 30 days" trend="+9%" />
        <StatCard label="Quote requests" value="46" hint="Across live client sites" trend="+5" />
        <StatCard label="Conversion rate" value="3.8%" hint="Placeholder" />
        <StatCard label="Avg session" value="2m 14s" hint="Placeholder" />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Traffic trend</h2>
          <div className="mt-6 flex h-40 items-end gap-2">
            {[40, 55, 48, 62, 70, 66, 78, 74, 82, 88, 80, 92].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-brand-deep to-brand-copper/80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">Placeholder bar chart — last 12 weeks</p>
        </article>
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Top client sites</h2>
          <ul className="mt-4 space-y-3">
            {[
              { name: "accufabnm.com", visits: "3,104" },
              { name: "blackmesawelding.com", visits: "2,441" },
              { name: "carlsbadcafeco.com", visits: "1,872" },
            ].map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2.5 text-sm"
              >
                <span className="font-semibold">{row.name}</span>
                <span className="text-muted">{row.visits} visits</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
