"use client";

import { useActionState } from "react";
import { disconnectGmailAction, sendGmailTestAction, type GmailActionState } from "@/app/admin/gmail-actions";

const initial: GmailActionState = {};

const notices: Record<string, string> = {
  connected: "Gmail is connected for sending. No prospect was contacted.",
  disconnected: "Gmail is disconnected.",
  denied: "Google authorization was cancelled. Nothing was saved.",
  "wrong-account": "Only 4wardwebdesigns@gmail.com can be connected. A different account was not saved.",
  storage: "Approve migration 014 before connecting Gmail. Nothing was saved.",
  unconfigured: "Add the Google OAuth values in the hosting environment before connecting.",
  host: "Open this dashboard on www.4wardwebdesign.com before connecting Gmail.",
  state: "That connection attempt expired. Choose Connect again.",
  exchange: "Google did not complete the connection. Nothing was saved.",
};

export function GmailConnection({
  connected,
  email,
  pendingMigration,
  configured,
  notice,
}: {
  connected: boolean;
  email: string;
  pendingMigration: boolean;
  configured: boolean;
  notice: string;
}) {
  const [disconnectState, disconnectAction, disconnecting] = useActionState(disconnectGmailAction, initial);
  const [testState, testAction, testing] = useActionState(sendGmailTestAction, initial);
  const banner = notices[notice] || "";
  const canConnect = configured && !pendingMigration;

  return (
    <section className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Gmail connection</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            Connect 4wardwebdesigns@gmail.com for a later outreach phase. The permission can send mail and confirm that mailbox. It cannot read the inbox. Automatic sending stays off.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Connected mailbox</dt>
          <dd className="mt-1 text-muted">{email || "No mailbox is connected"}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-3 text-sm">
          <dt className="font-semibold text-ink">Manual test</dt>
          <dd className="mt-1 text-muted">Sends one message to the signed-in administrator’s confirmed email. Prospects are not included.</dd>
        </div>
      </dl>

      {pendingMigration ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Mailbox storage is waiting for approval of migration 014. Connecting stays unavailable until then.
        </p>
      ) : null}
      {!configured ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Add the Google OAuth client and token encryption key in the hosting environment before connecting.
        </p>
      ) : null}
      {banner ? <p className="mt-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink">{banner}</p> : null}
      {disconnectState.error || testState.error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {disconnectState.error || testState.error}
        </p>
      ) : null}
      {disconnectState.message || testState.message ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {disconnectState.message || testState.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canConnect ? (
          <a href="/api/admin/gmail/start" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
            {connected ? "Reconnect Gmail" : "Connect Gmail"}
          </a>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-full bg-black/10 px-4 py-2 text-sm font-semibold text-muted">Connect Gmail</span>
        )}
        {connected ? (
          <form action={disconnectAction}>
            <button type="submit" disabled={disconnecting} className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </form>
        ) : null}
        {connected ? (
          <form action={testAction}>
            <button type="submit" disabled={testing} className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
              {testing ? "Sending…" : "Send admin test"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
