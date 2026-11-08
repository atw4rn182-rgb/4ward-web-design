"use client";

import { useActionState, useState } from "react";
import { cleanupProspectLogsAction, type ProspectActionState } from "@/app/admin/prospect-actions";
import type { UsageDay } from "@/lib/prospects/queries";

const initial: ProspectActionState = {};

export function UsagePanel({
  requests,
  totalProspects,
  recentWrites,
  usage,
  lastRun,
  lastCleanup,
  unavailable = false,
}: {
  requests: number;
  totalProspects: number;
  recentWrites: number;
  usage: UsageDay[];
  lastRun: string;
  lastCleanup: string;
  unavailable?: boolean;
}) {
  const [state, formAction, pending] = useActionState(cleanupProspectLogsAction, initial);
  const [confirmed, setConfirmed] = useState(false);
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = usage.find((row) => String(row.day).slice(0, 10) === todayKey)?.writes || 0;

  return (
    <section className="mb-5 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-bold text-ink">Usage</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        These are application counters from this admin tool. They are not Supabase billing metrics.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Outreach queries this view</dt>
          <dd>{requests}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Prospects</dt>
          <dd>{totalProspects}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Writes today</dt>
          <dd>{today}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Writes in 7 days</dt>
          <dd>{recentWrites}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Last automation run</dt>
          <dd>{lastRun}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Last log cleanup</dt>
          <dd>{lastCleanup}</dd>
        </div>
      </dl>
      <form action={formAction} className="mt-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="confirmCleanup" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending || unavailable} />
          Remove operational notes older than 180 days
        </label>
        <button
          type="submit"
          disabled={pending || unavailable || !confirmed}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Cleaning…" : "Clean up old logs"}
        </button>
        {unavailable ? <p className="mt-2 text-sm text-muted">Prospect tables are not available, so cleanup cannot run.</p> : null}
        <p className="mt-2 text-sm text-muted">
          Removes operational notes older than 180 days and usage counters older than 90 days. Opt-out records stay.
        </p>
        {state.error ? <p className="mt-2 text-sm text-red-800" role="alert">{state.error}</p> : null}
        {state.message ? <p className="mt-2 text-sm text-emerald-900">{state.message}</p> : null}
      </form>
    </section>
  );
}
