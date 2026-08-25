import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
import { AdminTableScroll } from "@/components/admin/AdminTableScroll";
import { DeleteRecordButton } from "@/components/admin/DeleteRecordButton";
import { getCustomers, getOnboardings, labelStatus } from "@/lib/supabase/queries";
import { tierLabel } from "@/lib/pricing/tier-labels";

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
  const paymentPending = customers.filter((row) => row.status === "payment_pending").length;

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Live customer records from Supabase. Delete any individual client or onboarding submission after confirming — only the record you choose is removed."
      />
      {schemaMissing ? <SchemaNotice /> : null}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Total clients" value={String(customers.length)} hint="All statuses" />
        <StatCard label="Active" value={String(active)} hint="Paid / active clients" />
        <StatCard label="Payment pending" value={String(paymentPending)} hint="Onboarding, awaiting Stripe" />
      </section>
      {customers.length === 0 ? (
        <EmptyState
          title="No clients yet"
          detail="When a customer finishes onboarding, they will appear in this list."
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {customers.map((row) => {
              const key = (row.email || row.company_name || "").toLowerCase();
              return (
                <article
                  key={row.id}
                  className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{row.company_name}</p>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        {row.contact_name || row.email || "—"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                      {labelStatus(row.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
                    Tier · {latestTier.get(key) || "—"}
                  </p>
                  <div className="mt-4">
                    <DeleteRecordButton
                      kind="customer"
                      id={row.id}
                      label={row.company_name}
                      detail={`${row.contact_name || row.email || "No contact"} · ${labelStatus(row.status)}`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden md:block">
            <AdminTableScroll>
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Tier</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
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
                        <td className="px-4 py-3 align-top">
                          <DeleteRecordButton
                            kind="customer"
                            id={row.id}
                            label={row.company_name}
                            detail={`${row.contact_name || row.email || "No contact"} · ${labelStatus(row.status)}`}
                            compact
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
        </>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">Recent onboarding</h2>
        <p className="mt-1 text-sm text-muted">
          Submissions from the client onboarding form, including domain preferences.
        </p>
        {onboardings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No onboarding submissions yet"
              detail="New onboarding records will appear here after clients start checkout."
            />
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-3 md:hidden">
              {onboardings.slice(0, 40).map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {row.company_name || row.contact_name || "—"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">{row.email || "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                      {labelStatus(row.status)}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Tier</dt>
                      <dd className="font-medium text-ink">{tierLabel(row.tier)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Domain</dt>
                      <dd className="truncate font-medium text-ink">{row.domain_preferred || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Alternates</dt>
                      <dd className="mt-0.5 break-words text-xs text-ink">
                        {[row.domain_second_choice, row.domain_third_choice].filter(Boolean).join(" · ") ||
                          "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <DeleteRecordButton
                      kind="onboarding"
                      id={row.id}
                      label={`${row.company_name || row.contact_name || "Onboarding"} · ${row.email || "no email"}`}
                      detail={`${tierLabel(row.tier)} · ${labelStatus(row.status)} · ${row.domain_preferred || "no domain"}`}
                    />
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 hidden md:block">
              <AdminTableScroll>
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 font-semibold">Tier</th>
                      <th className="px-4 py-3 font-semibold">Preferred domain</th>
                      <th className="px-4 py-3 font-semibold">Alternates</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {onboardings.slice(0, 40).map((row) => (
                      <tr key={row.id} className="hover:bg-black/[0.02]">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">
                            {row.company_name || row.contact_name || "—"}
                          </p>
                          <p className="text-xs text-muted">{row.email || "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-muted">{tierLabel(row.tier)}</td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {row.domain_preferred || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {[row.domain_second_choice, row.domain_third_choice]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
                            {labelStatus(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <DeleteRecordButton
                            kind="onboarding"
                            id={row.id}
                            label={`${row.company_name || row.contact_name || "Onboarding"} · ${row.email || "no email"}`}
                            detail={`${tierLabel(row.tier)} · ${labelStatus(row.status)} · ${row.domain_preferred || "no domain"}`}
                            compact
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
