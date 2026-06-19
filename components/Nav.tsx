"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Pool-Gap Finder" },
  { href: "/team", label: "Team Comp Builder" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav
      className="flex gap-1 px-5 py-3 mb-2"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
            style={{
              background: active ? "var(--panel-2)" : "transparent",
              color: active ? "var(--accent)" : "var(--muted)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
