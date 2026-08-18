"use client";

import { useActionState } from "react";
import {
  generateQuotePaymentLinkAction,
  sendQuotePaymentLinkEmailAction,
  type QuoteActionState,
} from "@/app/admin/quote-actions";
import { formatMoney } from "@/lib/format";
import type { QuoteRow } from "@/lib/supabase/queries";

const initial: QuoteActionState = {};

function amountInput(cents: number | null) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function QuotePaymentPanel({ quote }: { quote: QuoteRow }) {
  const [generateState, generateAction, generatePending] = useActionState(
    generateQuotePaymentLinkAction,
    initial
  );
  const [emailState, emailAction, emailPending] = useActionState(
    sendQuotePaymentLinkEmailAction,
    initial
  );

  const isPaid = quote.payment_status === "paid" || quote.status === "paid";
  const paymentUrl = generateState.paymentUrl || quote.stripe_payment_url;

  return (
    <section className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
      <h2 className="font-display text-lg font-bold tracking-tight">Stripe payment link</h2>
      <p className="mt-1 text-sm text-muted">
        Generate a secure Stripe-hosted payment page for the exact quoted amount. Payment status
        updates only after Stripe confirms payment through the webhook — not when the customer opens
        the link.
      </p>

      {(generateState.error || emailState.error) && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {generateState.error || emailState.error}
        </p>
      )}
      {(generateState.message || emailState.message) && (generateState.ok || emailState.ok) && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {generateState.message || emailState.message}
        </p>
      )}

      <form action={generateAction} className="mt-4 space-y-4">
        <input type="hidden" name="quoteId" value={quote.id} />
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-semibold text-ink">Final amount (USD)</span>
          <input
            name="quotedAmount"
            type="text"
            inputMode="decimal"
            defaultValue={amountInput(quote.quoted_amount_cents)}
            placeholder="0.00"
            disabled={isPaid}
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={isPaid || generatePending}
          className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
        >
          {generatePending ? "Generating…" : "Generate Stripe payment link"}
        </button>
      </form>

      {paymentUrl ? (
        <div className="mt-6 space-y-4 border-t border-black/10 pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment URL</p>
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-sm font-medium text-brand-deep underline-offset-2 hover:underline"
            >
              {paymentUrl}
            </a>
            {quote.quoted_amount_cents != null ? (
              <p className="mt-2 text-xs text-muted">
                Customer will be charged{" "}
                {formatMoney(quote.quoted_amount_cents, quote.currency)} on Stripe checkout.
              </p>
            ) : null}
          </div>

          <form action={emailAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="quoteId" value={quote.id} />
            <button
              type="submit"
              disabled={isPaid || emailPending}
              className="rounded-full border border-brand-blue/30 bg-white px-5 py-2.5 text-sm font-semibold text-brand-deep transition hover:bg-brand-blue/5 disabled:opacity-60"
            >
              {emailPending ? "Sending…" : `Email link to ${quote.email}`}
            </button>
          </form>
        </div>
      ) : null}

      <dl className="mt-6 grid gap-3 border-t border-black/10 pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Payment link ID</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-ink">
            {quote.stripe_payment_link_id || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Checkout session</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-ink">
            {quote.stripe_checkout_session_id || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Payment intent</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-ink">
            {quote.stripe_payment_intent_id || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Stripe customer</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-ink">
            {quote.stripe_customer_id || "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
