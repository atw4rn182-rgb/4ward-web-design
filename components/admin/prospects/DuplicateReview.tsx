"use client";

import Link from "next/link";
import { useActionState } from "react";
import { authorizeResendAction, deleteDuplicateAction, dismissDuplicateAction, type ProspectActionState } from "@/app/admin/prospect-actions";

type Item = {
  id: string;
  businessName: string;
  email: string;
  city: string;
  kind: string;
  reason: string;
  matchId: string;
  matchName: string;
  previousSendAt: string;
  previousSendLabel: string;
  sendResult: string;
};

const initial: ProspectActionState = {};
const KIND_LABEL: Record<string, string> = { email: "Same email", name: "Possible company-name match", phone: "Same phone" };

function ReviewActions({ item }: { item: Item }) {
  const [dismissed, dismiss, dismissPending] = useActionState(dismissDuplicateAction, initial);
  const [removed, remove, removePending] = useActionState(deleteDuplicateAction, initial);
  const [authorized, authorize, authorizePending] = useActionState(authorizeResendAction, initial);
  const canResend = Boolean(item.previousSendAt) && Boolean(item.email) && !/uncertain/i.test(item.sendResult);
  return (
    <div className="mt-3 grid gap-2">
      <form action={dismiss} className="rounded-xl border border-black/10 bg-white p-3">
        <input type="hidden" name="id" value={item.id} />
        <label className="flex min-h-11 items-start gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="confirmDismiss" className="mt-1 h-5 w-5" disabled={dismissPending} />
          Keep {item.matchName} and dismiss this duplicate.
        </label>
        <button type="submit" disabled={dismissPending} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/10 px-3 text-xs font-semibold">
          {dismissPending ? "Saving…" : "Keep original and dismiss"}
        </button>
        {dismissed.error ? <p className="mt-2 text-sm text-red-800" role="alert">{dismissed.error}</p> : null}
        {dismissed.message ? <p className="mt-2 text-sm text-emerald-900">{dismissed.message}</p> : null}
      </form>
      <form action={remove} className="rounded-xl border border-black/10 bg-white p-3">
        <input type="hidden" name="id" value={item.id} />
        <label className="flex min-h-11 items-start gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="confirmDelete" className="mt-1 h-5 w-5" disabled={removePending} />
          Delete this duplicate entry. The original, its email history, and suppression records stay.
        </label>
        <button type="submit" disabled={removePending} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/10 px-3 text-xs font-semibold">
          {removePending ? "Deleting…" : "Delete duplicate only"}
        </button>
        {removed.error ? <p className="mt-2 text-sm text-red-800" role="alert">{removed.error}</p> : null}
        {removed.message ? <p className="mt-2 text-sm text-emerald-900">{removed.message}</p> : null}
      </form>
      {canResend ? (
        <form action={authorize} className="rounded-xl border border-black/10 bg-white p-3">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="recipient" value={item.email} />
          <input type="hidden" name="previousSendAt" value={item.previousSendAt} />
          <p className="text-sm text-ink">One additional message to {item.email}. Previous send {item.previousSendLabel}. It joins the weekday queue and does not send now.</p>
          <label className="mt-2 flex min-h-11 items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="confirmResend" className="mt-1 h-5 w-5" disabled={authorizePending} />
            Authorize exactly one resend to {item.email}. Previous send {item.previousSendLabel}.
          </label>
          <button type="submit" disabled={authorizePending} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/10 px-3 text-xs font-semibold">
            {authorizePending ? "Authorizing…" : "Authorize one resend"}
          </button>
          {authorized.error ? <p className="mt-2 text-sm text-red-800" role="alert">{authorized.error}</p> : null}
          {authorized.message ? <p className="mt-2 text-sm text-emerald-900">{authorized.message}</p> : null}
        </form>
      ) : (
        <p className="text-sm text-muted">A resend is not available. {item.previousSendAt ? item.sendResult : "There is no previous send to repeat."}</p>
      )}
    </div>
  );
}

export function DuplicateReview({ items }: { items: Item[] }) {
  const groups = [
    ["email", "Same normalized email"],
    ["name", "Possible company-name matches"],
    ["phone", "Same phone number"],
  ] as const;
  return (
    <section id="duplicate-review" className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold text-ink">Duplicates / Resend review</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {items.length} open {items.length === 1 ? "duplicate" : "duplicates"}. They stay out of automatic sending until you keep the original, delete only the duplicate, or authorize one later send. Opt-outs, customers, closed businesses, invalid emails, and uncertain sends stay blocked.
      </p>
      {items.length === 0 ? <p className="mt-3 text-sm text-ink">No open duplicates.</p> : null}
      {groups.map(([kind, title]) => {
        const rows = items.filter((item) => item.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind} className="mt-4">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <ul className="mt-2 grid gap-3">
              {rows.map((item) => (
                <li key={item.id} className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{KIND_LABEL[kind]}</p>
                  <Link href={`/admin/prospects/${item.id}`} className="mt-1 inline-flex min-h-11 items-center font-semibold text-ink">{item.businessName}</Link>
                  <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted">Email</dt><dd>{item.email || "An email address is missing."}</dd></div>
                    <div><dt className="text-muted">Matching record</dt><dd><Link className="underline" href={`/admin/prospects/${item.matchId}`}>{item.matchName}</Link></dd></div>
                    <div><dt className="text-muted">Reason flagged</dt><dd>{item.reason}</dd></div>
                    <div><dt className="text-muted">Previous send</dt><dd>{item.previousSendLabel}</dd></div>
                    <div><dt className="text-muted">Saved send result</dt><dd>{item.sendResult}</dd></div>
                  </dl>
                  <ReviewActions item={item} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
