"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useActionState } from "react";
import { approveProspectsAction, type ProspectActionState } from "@/app/admin/prospect-actions";
import { approvalDecision } from "@/lib/prospects/approval.mjs";

export type ApprovalRow = {
  id: string;
  business_name: string;
  city?: string | null;
  service_area?: string | null;
  public_email?: string | null;
  secondary_email?: string | null;
  status: string;
  notes?: string | null;
  research_notes?: string | null;
  gbp_observations?: string | null;
  outreach_eligible?: boolean;
  sent_at?: string | null;
};

type ApprovalContextValue = {
  selected: Record<string, boolean>;
  toggle: (id: string) => void;
  ask: (ids: string[]) => void;
  pending: boolean;
};

const ApprovalContext = createContext<ApprovalContextValue | null>(null);
const initial: ProspectActionState = {};

function isPendingStatus(status: string) {
  return status === "queued" || status === "researching";
}

export function PendingApprovalProvider({ rows, children }: { rows: ApprovalRow[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [state, action, pending] = useActionState(approveProspectsAction, initial);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const value = useMemo<ApprovalContextValue>(() => ({
    selected,
    toggle: (id: string) => setSelected((current) => ({ ...current, [id]: !current[id] })),
    ask: (ids: string[]) => setConfirmIds(ids),
    pending,
  }), [selected, pending]);
  const decisions = (confirmIds || []).map((id) => approvalDecision(byId.get(id) || { id, business_name: "This business", status: "" }));
  const eligible = decisions.filter((item) => item.ok);
  const blocked = decisions.filter((item) => !item.ok);

  return (
    <ApprovalContext.Provider value={value}>
      {confirmIds ? (
        <section aria-label="Approval confirmation" className="mb-4 rounded-2xl border border-black/10 bg-paper p-4 shadow-soft">
          <h2 className="font-display text-lg font-bold text-ink">Confirm approval</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Eligible records are marked Ready and labeled Admin approved. No email is sent now.</p>
          {eligible.length ? (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-ink">Will be marked Ready</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {eligible.map((item) => <li key={item.id}>{item.name} — {item.email}</li>)}
              </ul>
            </div>
          ) : null}
          {blocked.length ? (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-ink">Cannot be approved</h3>
              <ul className="mt-1 space-y-2 text-sm">
                {blocked.map((item) => (
                  <li key={item.id}>
                    <span className="font-semibold">{item.name} — {item.email}</span>
                    <span className="mt-1 block text-red-800">{item.reasons.join(" ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <form action={action} className="mt-3">
            {eligible.map((item) => <input key={item.id} type="hidden" name="id" value={item.id} />)}
            {eligible.length ? (
              <label className="flex min-h-11 items-start gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" name="confirmApprove" className="mt-1 h-5 w-5" disabled={pending} />
                Approve the companies listed as eligible.
              </label>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {eligible.length ? (
                <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center rounded-full bg-brand-deep px-4 text-sm font-semibold text-white">
                  {pending ? "Approving…" : "Confirm approval"}
                </button>
              ) : null}
              <button type="button" onClick={() => setConfirmIds(null)} className="inline-flex min-h-11 items-center rounded-full border border-black/10 px-4 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {state.error ? <p className="mb-3 text-sm text-red-800" role="alert">{state.error}</p> : null}
      {state.approval ? (
        <div className="mb-3 rounded-2xl border border-black/10 bg-white p-4 text-sm">
          <p className="font-semibold text-ink">{state.message}</p>
          {state.approval.approved.length ? (
            <ul className="mt-2 space-y-1">
              {state.approval.approved.map((item) => <li key={item.id}>{item.name} — {item.email}. Admin approved.</li>)}
            </ul>
          ) : null}
          {state.approval.blocked.length ? (
            <ul className="mt-2 space-y-2">
              {state.approval.blocked.map((item) => (
                <li key={item.id}><span className="font-semibold">{item.name} — {item.email}.</span> {item.reasons.join(" ")}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {children}
    </ApprovalContext.Provider>
  );
}

export function PendingCheckbox({ id, status, name }: { id: string; status: string; name: string }) {
  const approval = useContext(ApprovalContext);
  if (!approval || !isPendingStatus(status)) return null;
  return (
    <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
      <input
        type="checkbox"
        className="h-5 w-5"
        checked={Boolean(approval.selected[id])}
        onChange={() => approval.toggle(id)}
      />
      Select {name}
    </label>
  );
}

export function ApproveProspectButton({ id, status }: { id: string; status: string }) {
  const approval = useContext(ApprovalContext);
  if (!approval || !isPendingStatus(status)) return null;
  return (
    <button
      type="button"
      disabled={approval.pending}
      onClick={() => approval.ask([id])}
      className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/10 px-3 text-xs font-semibold"
    >
      Approve for sending
    </button>
  );
}

export function ApproveSelectedBar() {
  const approval = useContext(ApprovalContext);
  if (!approval) return null;
  const ids = Object.keys(approval.selected).filter((id) => approval.selected[id]);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!ids.length || approval.pending}
        onClick={() => approval.ask(ids)}
        className="inline-flex min-h-11 items-center rounded-full bg-brand-deep px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        Approve selected
      </button>
      <p className="text-sm text-muted">{ids.length} selected</p>
    </div>
  );
}

export function SingleProspectApproval({ row }: { row: ApprovalRow }) {
  if (!isPendingStatus(row.status)) return null;
  return (
    <PendingApprovalProvider rows={[row]}>
      <ApproveProspectButton id={row.id} status={row.status} />
    </PendingApprovalProvider>
  );
}
