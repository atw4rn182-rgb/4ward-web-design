"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveOutreachSettingsAction,
  type ProspectActionState,
} from "@/app/admin/prospect-actions";
import { LOOKUP_BLOCKER, READY_FLOOR, READY_GOAL } from "@/lib/prospects/discovery.mjs";
import { clampDailyTarget, externalOutreachAllowed, monthlyOutreachVolume } from "@/lib/prospects/model.mjs";
import { needsMoreVerified } from "@/lib/prospects/queue.mjs";
import { BUSINESS_POSTAL_ADDRESS } from "@/lib/prospects/research.mjs";
import type { OutreachSettingsRow } from "@/lib/prospects/queries";

const initial: ProspectActionState = {};

export function OutreachSettingsForm({
  settings,
  nextRun,
  schedulerActive,
  interestedLeads = 0,
  readyCount = 0,
  pendingCount = 0,
  nextResearch = "Not scheduled",
  upcoming = [],
}: {
  settings: OutreachSettingsRow | null;
  nextRun: string;
  schedulerActive: boolean;
  interestedLeads?: number;
  readyCount?: number;
  pendingCount?: number;
  nextResearch?: string;
  upcoming?: { id: string; business_name: string; city: string | null; sendAt?: string; queuePosition?: number | null }[];
}) {
  const [state, formAction, pending] = useActionState(saveOutreachSettingsAction, initial);
  const enabled = settings?.automation_enabled ?? false;
  const manualPriority = settings?.manual_priority ?? true;
  const summary = settings?.last_run_summary || {};
  const submitted = Number(summary.submitted || 0);
  const failed = Number(summary.failed || 0);
  const skipped = Number(summary.skipped || 0);
  const replies = Number(summary.replies || 0);
  const consultations = Number(summary.consultations || 0);
  const conversions = Number(summary.conversions || 0);
  const shortfall = Number(summary.shortfall || 0);
  const discoveryPromoted = Number(summary.discoveryPromoted || 0);
  const discoveryReviewed = Number(summary.discoveryReviewed || 0);
  const blocker = String(summary.discoveryBlocker || LOOKUP_BLOCKER);
  const lastResearch = summary.lastResearchAt ? new Date(String(summary.lastResearchAt)).toLocaleString("en-US", { timeZone: "America/Denver" }) : "No research run has completed";
  const remaining = Math.max(0, readyCount - upcoming.length);
  const [target, setTarget] = useState(clampDailyTarget(settings?.weekday_target));
  const monthly = monthlyOutreachVolume(target);
  useEffect(() => {
    if (typeof state.weekdayTarget === "number") setTarget(clampDailyTarget(state.weekdayTarget));
  }, [state.weekdayTarget]);

  return (
    <form action={formAction} className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Automation</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            {schedulerActive
              ? "Qualified prospects become Ready after their saved public page confirms the checks. No separate approval is required. Weekday outreach sends up to five at 9:00 AM America/Denver. Businesses with no website come first, oilfield services come first inside each group, and queue order is kept inside that group. A recorded website does not block a send. Closed businesses, opt-outs, and uncertain sends stay out."
              : "These settings are saved for a later phase. The scheduler is off, so changing them does not research businesses or send email."}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${schedulerActive ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {schedulerActive ? "Scheduler on" : "Scheduler off"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="automationEnabled" value="on" />
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
          <input type="checkbox" name="pauseAutomation" defaultChecked={!enabled} />
          Pause automation
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
          <input type="checkbox" name="manualPriority" defaultChecked={manualPriority} />
          Keep manual additions in queue order
        </label>
        <label className="block rounded-xl bg-black/[0.03] px-3 py-3 text-sm font-semibold text-ink">
          Daily email target
          <select
            name="weekdayTarget"
            value={target}
            onChange={(event) => setTarget(clampDailyTarget(event.target.value))}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value} per weekday
              </option>
            ))}
          </select>
          <span className="mt-2 block font-normal text-muted">
            Current target: {target} successfully submitted emails each weekday. About {monthly} per month. A successful retry counts toward the limit. Saving waits for the weekday schedule.
            {externalOutreachAllowed({ mailingAddress: settings?.mailing_address, schedulerActive })
              ? ""
              : " External prospect email stays off until a mailing address is saved and a later phase starts the scheduler."}
          </span>
        </label>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Schedule</span>
          Monday–Friday at 9:00 AM America/Denver. A missed day is not caught up.
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Retry limit</span>
          {settings?.max_retries ?? 2} attempts, {settings?.request_timeout_seconds ?? 8}s timeout
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Last run</span>
          {settings?.last_run_at ? new Date(settings.last_run_at).toLocaleString("en-US", { timeZone: "America/Denver" }) : "No runs yet"}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Pending research</span>
          <a className="underline" href="/admin/prospects?status=awaiting#prospect-list">{pendingCount}</a>
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Ready to contact</span>
          <a className="underline" href="/admin/prospects?status=ready#prospect-list">{readyCount}</a>
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Ready backlog remaining</span>
          {remaining} after the next {upcoming.length} scheduled {upcoming.length === 1 ? "recipient" : "recipients"}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm sm:col-span-2">
          <span className="block font-semibold text-ink">Next five scheduled recipients</span>
          {needsMoreVerified(readyCount)
            ? `The queue needs more verified prospects before a full weekday send. ${readyCount} Ready, ${pendingCount} still Pending research. The next run sends only Ready businesses that pass the recheck, and it does not send a whole imported batch.`
            : null}
          {upcoming.length
            ? upcoming.map((row) => `${row.queuePosition ? `#${row.queuePosition} ` : ""}${row.business_name}${row.city ? `, ${row.city}` : ""}${row.sendAt ? ` — ${new Date(row.sendAt).toLocaleString("en-US", { timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`).join("; ")
            : "No verified Ready business is waiting in send order. The send rechecks the full queue and will send fewer than five when the verified list is short."}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm sm:col-span-2">
          <span className="block font-semibold text-ink">Discovery progress</span>
          {readyCount} of {READY_GOAL} Ready. Replenishment runs when Ready falls below {READY_FLOOR}. {summary.discoveryActive === true ? "A discovery run saved verified businesses." : "Lookup of new businesses is not active."}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Last research run</span>
          {lastResearch}. Reviewed {discoveryReviewed}, marked {discoveryPromoted} Ready. Research does not send email.
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Next research run</span>
          {nextResearch}. It only reviews saved records and does not send.
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <span className="block font-semibold text-ink">Next send</span>
          {nextRun}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm sm:col-span-2">
          <span className="block font-semibold text-ink">Blocker</span>
          {blocker}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm sm:col-span-2">
          <span className="block font-semibold text-ink">Outreach results</span>
          {settings?.last_run_at
            ? `${submitted} submitted, shortfall ${shortfall}, ${skipped} skipped, ${failed} failed.${summary.reason === "uncertain-hold" ? " Gmail's response was uncertain, so that recipient is held for review and the remaining slots were not given to anyone else." : ""} Discovery reviewed ${discoveryReviewed} and marked ${discoveryPromoted} Ready for a later delivery. Research does not send email.`
            : "No delivery has run yet. A shortfall is shown after the first weekday job."}
          {Array.isArray(summary.skippedDetails) && summary.skippedDetails.length
            ? ` Skipped: ${summary.skippedDetails.slice(0, 8).join(" ")}`
            : ""}
        </p>
        <p className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm sm:col-span-2">
          <span className="block font-semibold text-ink">Replies and outcomes</span>
          {replies} replies, {interestedLeads} interested leads, {consultations} consultations, {conversions} conversions.
          Consultations and conversions appear here when a later send records them.
        </p>
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Business mailing address
          <textarea
            name="mailingAddress"
            rows={4}
            maxLength={300}
            defaultValue={settings?.mailing_address || BUSINESS_POSTAL_ADDRESS}
            placeholder="PO BOX address used on prospect email"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
          />
          <span className="mt-1 block font-normal text-muted">
            USPS PO Box format. The post office street address is not part of this mailing address. Save it before any prospect email.
          </span>
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
      <label className="mt-4 flex min-h-11 items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="confirmOutreach" className="mt-1" disabled={pending} />
        <span>Confirm these settings. If pause is unchecked, weekday sending stays on. Saving does not send an email now.</span>
      </label>
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
