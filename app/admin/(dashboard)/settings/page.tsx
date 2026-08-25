import { PageHeader } from "@/components/admin/PageHeader";
import { LiveVerificationPanel } from "@/components/admin/LiveVerificationPanel";
import { getAdminUser } from "@/lib/supabase/admin";

export const metadata = {
  title: "Settings | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await getAdminUser();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Signed-in admin account. Notification delivery is not configured yet."
      />
      <div className="grid max-w-2xl gap-4">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Business profile</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              Company name
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-blue/30 min-h-11"
                defaultValue="4Ward Web Design, LLC"
                readOnly
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Signed in as
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-blue/30 min-h-11"
                defaultValue={user?.email || ""}
                readOnly
              />
            </label>
          </div>
        </article>
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Data source</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Clients, projects, payments, files, and notes come from your Supabase tables.
            If a table is missing, run <code>supabase/migrations/001_admin_schema.sql</code> in
            the Supabase SQL editor.
          </p>
        </article>
        <LiveVerificationPanel />
      </div>
    </div>
  );
}
