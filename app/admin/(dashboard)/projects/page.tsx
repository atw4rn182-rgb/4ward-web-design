import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { getProjects, labelStatus, relatedCompany } from "@/lib/supabase/queries";

export const metadata = {
  title: "Projects | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function ProjectsPage() {
  const { data: projects } = await getProjects();
  const open = projects.filter((row) => !["live", "archived"].includes(row.status)).length;
  const inReview = projects.filter((row) => row.status === "review").length;
  const launched = projects.filter((row) => row.status === "live").length;

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Website builds from the website_projects table."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open projects" value={String(open)} hint="Not live or archived yet" />
        <StatCard label="In review" value={String(inReview)} hint="Waiting on client feedback" />
        <StatCard label="Launched" value={String(launched)} hint="Marked live" />
      </section>
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          detail="Projects will show here after they are created in Supabase."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <article
              key={project.id}
              className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-bold tracking-tight">
                  {project.name}
                </h2>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {labelStatus(project.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {relatedCompany(project.customers)}
                {project.tier ? ` · ${project.tier}` : ""}
              </p>
              {project.live_url ? (
                <a
                  className="mt-3 inline-flex text-sm font-semibold text-brand-deep underline-offset-2 hover:underline"
                  href={project.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {project.live_url.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
