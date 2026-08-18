"use client";

import { useActionState } from "react";
import {
  updateQuoteManagementAction,
  type QuoteActionState,
} from "@/app/admin/quote-actions";
import {
  QUOTE_PAYMENT_STATUSES,
  QUOTE_STATUSES,
  quotePaymentStatusLabel,
  quoteStatusLabel,
} from "@/lib/quotes/statuses";
import { formatMoney, formatWhen } from "@/lib/format";
import type { QuoteRow } from "@/lib/supabase/queries";
import { QuotePaymentPanel } from "@/components/admin/QuotePaymentPanel";

const initial: QuoteActionState = {};

function amountInput(cents: number | null) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function QuoteManageForm({ quote }: { quote: QuoteRow }) {
  const [state, formAction, pending] = useActionState(updateQuoteManagementAction, initial);

  return (
    <div className="space-y-6">
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="quoteId" value={quote.id} />

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Quote saved.
        </p>
      ) : null}

      <section className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
        <h2 className="font-display text-lg font-bold tracking-tight">Customer request</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Name</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">{quote.contact_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Company</dt>
            <dd className="mt-0.5 text-sm text-ink">{quote.company_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Email</dt>
            <dd className="mt-0.5 text-sm text-ink">
              <a className="text-brand-deep underline-offset-2 hover:underline" href={`mailto:${quote.email}`}>
                {quote.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Phone</dt>
            <dd className="mt-0.5 text-sm text-ink">{quote.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Service</dt>
            <dd className="mt-0.5 text-sm font-medium text-brand-deep">{quote.service}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Submitted</dt>
            <dd className="mt-0.5 text-sm text-ink">{formatWhen(quote.created_at)}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Customer notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{quote.message}</dd>
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
        <h2 className="font-display text-lg font-bold tracking-tight">Quote management</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Workflow status</span>
            <select
              name="status"
              defaultValue={quote.status}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
            >
              {QUOTE_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Payment status</span>
            <select
              name="paymentStatus"
              defaultValue={quote.payment_status || "none"}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
            >
              {QUOTE_PAYMENT_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Quantity</span>
            <input
              name="quantity"
              type="text"
              defaultValue={quote.quantity || ""}
              placeholder="e.g. 500 business cards"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Amount quoted (USD)</span>
            <input
              name="quotedAmount"
              type="text"
              inputMode="decimal"
              defaultValue={amountInput(quote.quoted_amount_cents)}
              placeholder="0.00"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
            />
          </label>
        </div>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-semibold text-ink">Internal notes (admin only)</span>
          <textarea
            name="internalNotes"
            rows={6}
            defaultValue={quote.internal_notes || ""}
            placeholder="Vendor costs, design time, follow-up reminders — never shown to the customer."
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm leading-relaxed"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save quote"}
          </button>
          <p className="self-center text-xs text-muted">
            Current: {quoteStatusLabel(quote.status)} · Payment:{" "}
            {quotePaymentStatusLabel(quote.payment_status || "none")}
            {quote.quoted_amount_cents != null
              ? ` · ${formatMoney(quote.quoted_amount_cents, quote.currency)}`
              : ""}
          </p>
        </div>
      </section>
    </form>

      <QuotePaymentPanel quote={quote} />

      <section className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
        <h2 className="font-display text-lg font-bold tracking-tight">Timeline</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Quote sent</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {quote.quote_sent_at ? formatWhen(quote.quote_sent_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Paid at</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {quote.paid_at ? formatWhen(quote.paid_at) : "—"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
