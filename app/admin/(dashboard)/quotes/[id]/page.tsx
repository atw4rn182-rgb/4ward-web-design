import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { SchemaNotice } from "@/components/admin/SchemaNotice";
import { QuoteManageForm } from "@/components/admin/QuoteManageForm";
import { QuoteAutomationPanel } from "@/components/admin/QuoteAutomationPanel";
import { quoteStatusLabel, quotePaymentStatusLabel } from "@/lib/quotes/statuses";
import { formatMoney, formatWhen, getQuoteEmailEvents, getQuoteRequest } from "@/lib/supabase/queries";

export const metadata = {
  title: "Quote Detail | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: quote, missing }, emailEvents] = await Promise.all([
    getQuoteRequest(id),
    getQuoteEmailEvents(id),
  ]);

  if (missing) {
    return (
      <div>
        <PageHeader
          title="Quote detail"
          description="Manage a custom quote request."
        />
        <SchemaNotice />
      </div>
    );
  }

  if (!quote) notFound();

  const title = quote.company_name || quote.contact_name || "Quote request";

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/quotes"
          className="text-sm font-semibold text-brand-deep underline-offset-2 hover:underline"
        >
          ← Back to quotes
        </Link>
      </div>
      <PageHeader
        title={title}
        description={`${quote.service} · ${quoteStatusLabel(quote.status)} · Submitted ${formatWhen(quote.created_at)}`}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
          {quoteStatusLabel(quote.status)}
        </span>
        <span className="rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold text-brand-deep">
          Payment: {quotePaymentStatusLabel(quote.payment_status || "none")}
        </span>
        {quote.quoted_amount_cents != null ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
            Quoted {formatMoney(quote.quoted_amount_cents, quote.currency)}
          </span>
        ) : null}
      </div>
      <QuoteManageForm quote={quote} />
      <div className="mt-6">
        <QuoteAutomationPanel quote={quote} emailEvents={emailEvents.data} />
      </div>
    </div>
  );
}
