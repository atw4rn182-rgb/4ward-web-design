import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin/AdminShell";

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

  return <AdminShell email={user.email}>{children}</AdminShell>;
}
