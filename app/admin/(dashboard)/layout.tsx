import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/admin";
import { logoutAction } from "../actions";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAdminUser();

  if (!user) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/admin/login?error=unauthorized");
  }

  return (
    <div className="flex min-h-screen bg-sand">
      <AdminSidebar email={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-black/10 bg-paper/90 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-copper">
              Secure workspace
            </p>
            <p className="mt-0.5 text-sm text-muted">
              Manage clients, projects, and billing in one place.
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand-blue/40"
            >
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
