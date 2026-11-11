import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatWhen, getConsultations } from "@/lib/supabase/queries";

export const metadata = {
  title: "Consultations | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function ConsultationsPage() {
  const { data, missing } = await getConsultations();

  return (
    <div>
      <PageHeader
        title="Consultations"
        description="Free consultation requests. Submitting one does not create a Stripe subscription."
      />
      {missing ? (
        <EmptyState
          title="Consultations are not available yet"
          detail="The consultations table is not in this database. No schema change was applied from this update."
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No consultation requests yet"
          detail="New requests from the public consultation form will appear here."
        />
      ) : (
        <div className="space-y-3">
          {data.map((row) => {
            const packageLabel =
              row.payload?.preferred_package_label ||
              row.preferred_tier ||
              "Not Sure — Help Me Choose";
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {row.business_name} · {row.contact_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {row.email}
                      {row.phone ? ` · ${row.phone}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-ink">{packageLabel}</p>
                    {row.industry ? (
                      <p className="mt-1 text-sm text-muted">{row.industry}</p>
                    ) : null}
                    <p className="mt-2 break-words text-sm text-muted">
                      {row.project_description}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs font-medium text-muted">
                    <p>{formatWhen(row.created_at)}</p>
                    <p className="mt-1 capitalize">{row.status}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
