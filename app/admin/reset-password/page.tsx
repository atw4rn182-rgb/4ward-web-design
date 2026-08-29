import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Reset Password | 4Ward Web Design",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const linkError = params.error === "link" || params.error === "unauthorized";

  return (
    <main className="grid min-h-screen place-items-center bg-sand px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-black/10 bg-paper p-5 shadow-soft sm:p-6">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-copper">
          4Ward Web Design
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
          Create a new password
        </h1>
        <p className="mt-2 mb-5 text-sm leading-relaxed text-muted">
          Choose a new password for your admin account. You will sign in again after it is saved.
        </p>
        {linkError ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {params.error === "unauthorized"
              ? "This account is not authorized for admin access."
              : "That password reset link is invalid or expired. Request a new one from the sign-in page."}
          </p>
        ) : null}
        <ResetPasswordForm />
      </section>
    </main>
  );
}
