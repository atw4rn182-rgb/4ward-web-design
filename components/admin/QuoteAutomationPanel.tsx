"use client";

import { useActionState } from "react";
import {
  retryQuotePaymentConfirmationEmailAction,
  retryQuotePaymentLinkEmailAction,
  type QuoteActionState,
} from "@/app/admin/quote-actions";
import { formatWhen } from "@/lib/format";
import {
  QUOTE_EMAIL_ERROR_LABELS,
  type QuoteEmailErrorType,
} from "@/lib/quotes/automation";
import type { QuoteEmailEventRow, QuoteRow } from "@/lib/supabase/queries";

const initial: QuoteActionState = {};

function errorLabel(type: string | null) {
  if (!type) return "Email delivery";
  return QUOTE_EMAIL_ERROR_LABELS[type as QuoteEmailErrorType] || type.replace(/_/g, " ");
}

export function QuoteAutomationPanel({
  quote,
  emailEvents,
}: {
  quote: QuoteRow;
  emailEvents: QuoteEmailEventRow[];
}) {
  const [retryLinkState, retryLinkAction, retryLinkPending] = useActionState(
    retryQuotePaymentLinkEmailAction,
    initial
  );
  const [retryConfirmState, retryConfirmAction, retryConfirmPending] = useActionState(
    retryQuotePaymentConfirmationEmailAction,
    initial
  );

  const hasEmailError = Boolean(quote.last_email_error);
  const canRetryLink =
    hasEmailError &&
    quote.last_email_error_type === "payment_link_email" &&
    quote.stripe_payment_url &&
    quote.payment_status !== "paid";
  const canRetryConfirmation =
    hasEmailError &&
    quote.last_email_error_type === "payment_confirmation_email" &&
    quote.payment_status === "paid";

  const actionMessage = [retryLinkState, retryConfirmState].find(
    (state) => state.message || state.error
  );

  return (
    <section className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
      <h2 className="font-display text-lg font-bold tracking-tight">Automation & notifications</h2>
      <p className="mt-1 text-sm text-muted">
        Status, Stripe, and emails stay in sync. Customer emails never include internal notes.
      </p>

      {actionMessage ? (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            actionMessage.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {actionMessage.error || actionMessage.message}
        </p>
      ) : null}

      {hasEmailError ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            {errorLabel(quote.last_email_error_type)} failed
            {quote.last_email_error_at ? ` · ${formatWhen(quote.last_email_error_at)}` : ""}
          </p>
          <p className="mt-1">{quote.last_email_error}</p>
          <p className="mt-2 text-xs text-amber-900/80">
            The quote and payment records were saved. Retry the email below when ready.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canRetryLink ? (
              <form action={retryLinkAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <button
                  type="submit"
                  disabled={retryLinkPending}
                  className="rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-950 disabled:opacity-60 min-h-10 inline-flex items-center"
                >
                  {retryLinkPending ? "Retrying…" : "Retry payment link email"}
                </button>
              </form>
            ) : null}
            {canRetryConfirmation ? (
              <form action={retryConfirmAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <button
                  type="submit"
                  disabled={retryConfirmPending}
                  className="inline-flex min-h-10 items-center rounded-full border border-amber-900/30 bg-white px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
                >
                  {retryConfirmPending ? "Retrying…" : "Retry payment confirmation email"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
          No email delivery issues recorded for this quote.
        </p>
      )}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Payment link emailed</dt>
          <dd className="mt-0.5 text-sm text-ink">
            {quote.payment_link_sent_at ? formatWhen(quote.payment_link_sent_at) : "Not yet sent"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Stripe confirmed paid</dt>
          <dd className="mt-0.5 text-sm text-ink">
            {quote.paid_at ? formatWhen(quote.paid_at) : "Not yet paid"}
          </dd>
        </div>
      </dl>

      {emailEvents.length > 0 ? (
        <div className="mt-6 border-t border-black/10 pt-4">
          <h3 className="text-sm font-semibold text-ink">Recent email events</h3>
          <ul className="mt-3 divide-y divide-black/5">
            {emailEvents.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {event.event_type.replace(/_/g, " ")}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        event.status === "sent"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-red-50 text-red-800"
                      }`}
                    >
                      {event.status}
                    </span>
                  </p>
                  {event.error_message ? (
                    <p className="mt-0.5 text-xs text-red-700">{event.error_message}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted">{event.recipient_email || "—"}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">{formatWhen(event.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
