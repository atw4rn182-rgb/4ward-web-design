import { PageHeader } from "@/components/admin/PageHeader";

export const metadata = {
  title: "Settings | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Workspace preferences and account controls. Placeholder form fields for the admin shell."
      />
      <div className="grid max-w-2xl gap-4">
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Business profile</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              Company name
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-blue/30"
                defaultValue="4Ward Web Design, LLC"
                readOnly
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Support email
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-blue/30"
                defaultValue="4wardwebdesigns@gmail.com"
                readOnly
              />
            </label>
          </div>
        </article>
        <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
          <h2 className="font-display text-lg font-bold">Notifications</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              "Email me on new onboarding submissions",
              "Email me when a Stripe payment succeeds",
              "Weekly analytics digest",
            ].map((label) => (
              <li key={label} className="flex items-center gap-3">
                <span className="inline-flex h-5 w-9 items-center rounded-full bg-brand-blue/20 p-0.5">
                  <span className="h-4 w-4 rounded-full bg-brand-blue" />
                </span>
                <span className="font-medium text-ink">{label}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
