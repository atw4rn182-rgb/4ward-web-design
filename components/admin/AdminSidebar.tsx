"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/admin/clients", label: "Clients", icon: "◎" },
  { href: "/admin/projects", label: "Projects", icon: "◇" },
  { href: "/admin/payments", label: "Payments", icon: "$" },
  { href: "/admin/files", label: "Files", icon: "▤" },
  { href: "/admin/messages", label: "Messages", icon: "✉" },
  { href: "/admin/analytics", label: "Analytics", icon: "▴" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export function AdminSidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-black/10 bg-paper">
      <div className="border-b border-black/10 px-5 py-5">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand-copper">
          4Ward Admin
        </p>
        <p className="mt-1 truncate text-sm text-muted">{email || "Signed in"}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-brand-blue text-white shadow-soft"
                  : "text-ink/80 hover:bg-black/[0.04]"
              }`}
            >
              <span className="w-4 text-center text-xs opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
