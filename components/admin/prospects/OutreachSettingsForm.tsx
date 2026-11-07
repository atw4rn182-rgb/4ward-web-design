"use client";

import { useActionState } from "react";
import {
  saveOutreachSettingsAction,
  type ProspectActionState,
} from "@/app/admin/prospect-actions";
import type { OutreachSettingsRow } from "@/lib/prospects/queries";

const initial: ProspectActionState = {};

export function OutreachSettingsForm({
  settings,
  nextRun,
  schedulerActive,
}: {
  settings: OutreachSettingsRow | null;
  nextRun: string;
  schedulerActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveOutreachSettingsAction, initial);
  const enabled = settings?.automation_enabled ?? false;
  const manualPriority = settings?.manual_priority ?? true;
  const summary = settings?.last_run_summary || {};
  const submitted = Number(summary.submitted || 0);
  const failed = Number(summary.failed || 0);
  const skipped = Number(summary.skipped || 0);

  return (
    <form action={formAction} className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Automation</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            These settings are saved for a later phase. The scheduler is {schedulerActive ? "active" : "off"}, so changing them does not research businesses or send email.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
          Scheduler off
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
          <input type="checkbox" name="automationEnabled" defaultChecked={enabled} />
          Automation enabled
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
          <input type="checkbox" name="manualPriority" defaultChecked={manualPriority} />
          Manual prospects go first
        </label>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Weekday target</span>
          5 successfully submitted emails, Monday–Friday
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Schedule</span>
          9:00 AM America/Denver
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Last run</span>
          {settings?.last_run_at ? new Date(settings.last_run_at).toLocaleString("en-US", { timeZone: "America/Denver" }) : "No runs yet"}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Next scheduled run</span>
          {nextRun}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm sm:col-span-2">
          <span className="block font-semibold text-ink">Daily results</span>
          {settings?.last_run_at
            ? `${submitted} submitted, ${skipped} skipped, ${failed} failed`
            : "No completed runs"}
        </p>
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Business mailing address
          <textarea
            name="mailingAddress"
            rows={2}
            maxLength={300}
            defaultValue={settings?.mailing_address || ""}
            placeholder="Required later for CAN-SPAM. Leave blank until the address is confirmed."
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
          />
        </label>
      </div>
      {state.error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
