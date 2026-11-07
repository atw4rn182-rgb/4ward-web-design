"use client";

import { useActionState } from "react";
import {
  updateProspectResearchAction,
  updateProspectStatusAction,
  type ProspectActionState,
} from "@/app/admin/prospect-actions";
import { PROSPECT_STATUSES, STATUS_LABELS } from "@/lib/prospects/model.mjs";
import { QUALIFICATION_LABELS, readResearchRecord } from "@/lib/prospects/research.mjs";
import type { ProspectRow } from "@/lib/prospects/queries";

const initial: ProspectActionState = {};
const field =
  "mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm";

export function ProspectEditor({
  prospect,
  researchedOn,
}: {
  prospect: ProspectRow;
  researchedOn: string;
}) {
  const [statusState, statusAction, statusPending] = useActionState(updateProspectStatusAction, initial);
  const [researchState, researchAction, researchPending] = useActionState(
    updateProspectResearchAction,
    initial
  );
  const research = readResearchRecord(prospect);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={statusAction} className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
        <h2 className="font-display text-lg font-bold">Status</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Updating a status records the time and activity. It does not send an email.
        </p>
        <input type="hidden" name="id" value={prospect.id} />
        <label className="mt-4 block text-sm font-semibold">
          Status
          <select name="status" defaultValue={prospect.status} className={field}>
            {PROSPECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="outreachEligible" defaultChecked={prospect.outreach_eligible} />
          Eligible for a future outreach batch
        </label>
        <label className="mt-3 block text-sm font-semibold">
          Activity note
          <textarea name="note" rows={3} maxLength={500} className={field} />
        </label>
        {statusState.error ? <p className="mt-3 text-sm text-red-800" role="alert">{statusState.error}</p> : null}
        {statusState.message ? <p className="mt-3 text-sm text-emerald-900">{statusState.message}</p> : null}
        <button
          type="submit"
          disabled={statusPending}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {statusPending ? "Saving…" : "Save status"}
        </button>
      </form>

      <form action={researchAction} className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
        <h2 className="font-display text-lg font-bold">Research</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Correct any detail before it is trusted. Saving does not send email or guess a missing address.
        </p>
        <input type="hidden" name="id" value={prospect.id} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">
            Business name
            <input name="businessName" required defaultValue={prospect.business_name} className={field} />
          </label>
          <label className="text-sm font-semibold">
            City
            <input name="city" defaultValue={prospect.city || ""} className={field} />
          </label>
          <label className="text-sm font-semibold">
            Service area
            <input name="serviceArea" defaultValue={prospect.service_area || ""} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Industry
            <input name="industry" defaultValue={prospect.industry || ""} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Website
            <input name="website" defaultValue={prospect.website_url || ""} className={field} />
          </label>
          <label className="text-sm font-semibold">
            Public business email
            <input name="publicEmail" type="email" defaultValue={prospect.public_email || ""} className={field} />
          </label>
          <label className="text-sm font-semibold">
            Secondary contact email
            <input name="secondaryEmail" type="email" defaultValue={prospect.secondary_email || ""} className={field} />
          </label>
          <label className="text-sm font-semibold">
            Date researched
            <input name="researchedAt" type="date" defaultValue={researchedOn} className={field} />
          </label>
          <label className="text-sm font-semibold">
            Research confidence
            <select name="researchConfidence" defaultValue={prospect.research_confidence || ""} className={field}>
              <option value="">Not set</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Qualification
            <select name="qualification" defaultValue={research.qualification} className={field}>
              <option value="">Not set</option>
              {Object.entries(QUALIFICATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Qualification reason
            <textarea name="qualificationReason" rows={2} maxLength={500} defaultValue={research.qualification ? research.summary : ""} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Research summary
            <textarea name="researchNotes" rows={3} maxLength={1000} defaultValue={research.qualification ? "" : prospect.research_notes || ""} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Source URLs
            <textarea name="researchSources" rows={2} maxLength={800} defaultValue={prospect.research_sources || ""} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Factual notes
            <textarea name="factualNotes" rows={3} maxLength={1000} defaultValue={research.factualNotes} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Unsent draft subject
            <input name="draftSubject" maxLength={90} defaultValue={research.draftSubject} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Unsent draft
            <textarea name="draftBody" rows={6} maxLength={900} defaultValue={research.draftBody} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Google Business Profile observations
            <textarea name="gbpObservations" rows={3} maxLength={1000} defaultValue={prospect.gbp_observations || ""} className={field} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Notes
            <textarea name="notes" rows={3} maxLength={2000} defaultValue={prospect.notes || ""} className={field} />
          </label>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="outreachEligible" defaultChecked={prospect.outreach_eligible} />
          Eligible for outreach after review
        </label>
        {researchState.error ? <p className="mt-3 text-sm text-red-800" role="alert">{researchState.error}</p> : null}
        {researchState.message ? <p className="mt-3 text-sm text-emerald-900">{researchState.message}</p> : null}
        <button
          type="submit"
          disabled={researchPending}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {researchPending ? "Saving…" : "Save research"}
        </button>
      </form>
    </div>
  );
}
