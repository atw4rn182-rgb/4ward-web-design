import { LoginForm } from "./login-form";

export const metadata = {
  title: "Admin Login | 4Ward Web Design",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/admin") && params.next !== "/admin/login"
      ? params.next
      : "/admin/dashboard";

  return (
    <main className="grid min-h-screen place-items-center bg-sand px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-black/10 bg-paper p-6 shadow-soft">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-copper">
          4Ward Web Design
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
          Admin sign in
        </h1>
        <p className="mt-2 mb-5 text-sm leading-relaxed text-muted">
          Enter your email and password to open the secure admin dashboard.
        </p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
