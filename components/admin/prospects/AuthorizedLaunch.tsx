"use client";

import { useState, type FormEvent } from "react";
import { sendAuthorizedLaunchAction, type LaunchActionState } from "@/app/admin/outreach-launch-actions";
import { AUTHORIZED_LAUNCH } from "@/lib/prospects/authorized-launch.mjs";

type Shown = LaunchActionState & { businessName: string };

export function AuthorizedLaunch() {
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Shown[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || running) return;
    setRunning(true);
    const next: Shown[] = [];
    for (const recipient of AUTHORIZED_LAUNCH) {
      const result = await sendAuthorizedLaunchAction(recipient.key);
      next.push({ ...result, businessName: recipient.businessName });
      setResults([...next]);
      if (!result.ok || result.uncertain || !result.exclusionSaved) break;
    }
    setRunning(false);
    setConfirmed(false);
  }

  return (
    <section className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold text-ink">Authorized launch</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        These five messages were the authorized launch. Checking the box is required before anything is sent. An already accepted recipient is not sent again. Opt-outs, existing customers, and duplicates are refused. An uncertain Gmail response is not retried. Open a business to see its saved letter, time, and Gmail message ID.
      </p>
      <ul className="mt-3 grid gap-1 text-sm text-ink">
        {AUTHORIZED_LAUNCH.map((recipient) => (
          <li key={recipient.key}>
            {recipient.businessName}, {recipient.city}
            {recipient.oneTime ? " — one-time test" : ""}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={running} />
          Send these five messages once
        </label>
        <button
          type="submit"
          disabled={!confirmed || running}
          className="inline-flex min-h-11 items-center rounded-full bg-brand-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? "Sending…" : "Send authorized messages"}
        </button>
      </form>
      {results.length ? (
        <ul className="mt-4 grid gap-2 text-sm">
          {results.map((result) => (
            <li key={result.businessName} className="rounded-xl bg-black/[0.03] px-3 py-2">
              <p className="font-semibold text-ink">{result.businessName}</p>
              <p className="text-muted">
                {result.ok
                  ? `Gmail accepted the message. Message ID: ${result.id}. Inbox delivery was not checked.${result.alreadyRecorded ? " This acceptance was already recorded." : ""}`
                  : result.error || "The message was not sent."}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
