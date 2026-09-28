import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/actions";
import { Sidebar } from "@/app/(crm)/sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireAuthenticatedUser } from "@/lib/auth";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  const roleLabel = user.role === "ADMIN" ? "Admin" : "Retention agent";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <BrandLogo className="topbar-logo" />
        </div>
        <span className="topbar-spacer" />
        <ThemeToggle />
        <details className="user-menu">
          <summary aria-label={`Open user menu for ${user.fullName}`}>
            <span className="avatar" aria-hidden="true"><UserRound size={15} strokeWidth={1.8} /></span>
            <span className="user-summary"><span>{user.fullName}</span><small>{roleLabel}</small></span>
            <ChevronDown className="menu-chevron" size={13} strokeWidth={1.8} aria-hidden="true" />
          </summary>
          <div className="user-menu-popover">
            <div className="user-menu-identity"><strong>{user.fullName}</strong><span>{user.email}</span></div>
            <form action={signOut}><button className="logout-button" type="submit"><LogOut size={14} />Logout</button></form>
          </div>
        </details>
      </header>
      <Sidebar isAdmin={user.role === "ADMIN"} />
      <main className="workspace">{children}</main>
    </div>
  );
}
