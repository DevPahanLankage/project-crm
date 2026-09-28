"use client";

import { Settings, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link className={`nav-icon${pathname === "/leads" ? " active" : ""}`} href="/leads" aria-label="Leads / Clients" title="Leads / Clients" aria-current={pathname === "/leads" ? "page" : undefined}>
        <UsersRound size={17} strokeWidth={1.8} aria-hidden="true" />
      </Link>
      {isAdmin && (
        <Link className={`nav-icon${pathname.startsWith("/admin") ? " active" : ""}`} href="/admin" aria-label="Settings / Admin" title="Settings / Admin" aria-current={pathname.startsWith("/admin") ? "page" : undefined}>
          <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      )}
    </aside>
  );
}
