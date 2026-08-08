import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Projects | 4Ward Admin",
  robots: { index: false, follow: false },
};

const PROJECTS = [
  { name: "Accu-Fab redesign", stage: "Review", owner: "Nereece" },
  { name: "Black Mesa launch", stage: "Live", owner: "Nereece" },
  { name: "Desert Peak brochure", stage: "Design", owner: "Nereece" },
  { name: "Cafe Co. refresh", stage: "Development", owner: "Nereece" },
];

export default function ProjectsPage() {
  return (
    <div>
      <PageHeader
        title="Projects"
        description="Website builds and statuses. Placeholder cards until website_projects data is connected."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open projects" value="7" hint="Not yet archived" />
        <StatCard label="In review" value="2" hint="Waiting on client feedback" />
        <StatCard label="Launched YTD" value="5" hint="Placeholder count" trend="+1" />
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {PROJECTS.map((project) => (
          <article
            key={project.name}
            className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold tracking-tight">
                {project.name}
              </h2>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {project.stage}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">Owner: {project.owner}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
