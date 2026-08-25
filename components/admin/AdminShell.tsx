"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { logoutAction } from "@/app/admin/actions";

export const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "▣", short: "Home" },
  { href: "/admin/clients", label: "Clients", icon: "◎", short: "Clients" },
  { href: "/admin/quotes", label: "Quotes", icon: "❝", short: "Quotes" },
  { href: "/admin/projects", label: "Projects", icon: "◇", short: "Projects" },
  { href: "/admin/payments", label: "Payments", icon: "$", short: "Pay" },
  { href: "/admin/files", label: "Files", icon: "▤", short: "Files" },
  { href: "/admin/messages", label: "Messages", icon: "✉", short: "Notes" },
  { href: "/admin/analytics", label: "Analytics", icon: "▴", short: "Stats" },
  { href: "/admin/settings", label: "Settings", icon: "⚙", short: "Settings" },
] as const;

const PRIMARY_HREFS = new Set([
  "/admin/dashboard",
  "/admin/clients",
  "/admin/quotes",
  "/admin/payments",
]);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const primaryNav = ADMIN_NAV.filter((item) => PRIMARY_HREFS.has(item.href));

  return (
    <div className="flex min-h-screen bg-sand">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden"
          aria-label="Close navigation menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id={panelId}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-black/10 bg-paper shadow-soft transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-copper">
              4Ward Admin
            </p>
            <p className="mt-1 truncate text-sm text-muted">{email || "Signed in"}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-black/10 bg-white text-lg font-semibold text-ink lg:hidden"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {ADMIN_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-brand-blue text-white shadow-soft"
                    : "text-ink/80 hover:bg-black/[0.04]"
                }`}
              >
                <span className="w-4 text-center text-xs opacity-80" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-black/10 p-3 lg:hidden">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-ink transition hover:border-brand-blue/40"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-black/10 bg-paper/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-ink lg:hidden"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label="Open navigation menu"
              onClick={() => setOpen(true)}
            >
              <span className="flex flex-col gap-1.5" aria-hidden="true">
                <span className="block h-0.5 w-5 rounded-full bg-ink" />
                <span className="block h-0.5 w-5 rounded-full bg-ink" />
                <span className="block h-0.5 w-5 rounded-full bg-ink" />
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-copper">
                Secure workspace
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">
                Manage clients, projects, and billing in one place.
              </p>
            </div>
          </div>
          <form action={logoutAction} className="hidden sm:block">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand-blue/40"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:pb-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-paper/95 px-2 pt-2 backdrop-blur lg:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
        aria-label="Primary admin shortcuts"
      >
        <ul className="grid grid-cols-4 gap-1">
          {primaryNav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.68rem] font-semibold transition ${
                    active
                      ? "bg-brand-blue/10 text-brand-deep"
                      : "text-muted hover:bg-black/[0.04] hover:text-ink"
                  }`}
                >
                  <span className="text-sm leading-none" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
