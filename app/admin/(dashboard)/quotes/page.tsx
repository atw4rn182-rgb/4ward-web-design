import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
import { formatWhen, getQuoteRequests, labelStatus } from "@/lib/supabase/queries";

export const metadata = {
  title: "Quote Requests | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function QuotesPage() {
  const { data: quotes, missing } = await getQuoteRequests();

  const newQuotes = quotes.filter((row) => row.status === "new").length;
  const reviewing = quotes.filter((row) => row.status === "reviewing").length;

  return (
    <div>
      <PageHeader
        title="Quote requests"
        description="Custom work requests from quote.html — separate from website onboarding and Stripe checkout."
      />
      {missing ? <SchemaNotice /> : null}
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total requests" value={String(quotes.length)} hint="All quote submissions" />
        <StatCard label="New" value={String(newQuotes)} hint="Awaiting review" />
        <StatCard label="In review" value={String(reviewing)} hint="Being priced" />
      </section>
      {quotes.length === 0 ? (
        <EmptyState
          title="No quote requests yet"
          detail="Custom quote submissions will appear here when saved to Supabase."
        />
      ) : (
        <div className="space-y-3">
          {quotes.map((row) => (
            <article
              key={row.id}
              className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {row.company_name || row.contact_name}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {row.contact_name} · {row.email}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {labelStatus(row.status)}
                  </span>
                  <span className="text-xs font-medium text-muted">{formatWhen(row.created_at)}</span>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-brand-deep">{row.service}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{row.message}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
