import Link from "next/link";
import type { ReactNode } from "react";

import "./admin.css";

const navItems = [
  { href: "/admin/maids", label: "Maids" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/session-tables", label: "Session Tables" },
  { href: "/admin/session-maids", label: "Session Maids" },
  { href: "/admin/tables", label: "Tables" },
  { href: "/admin/table-layout", label: "Table Layout" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/menu-items", label: "Menu Items" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p
            style={{
              margin: "0 0 4px",
              color: "#6366f1",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
            }}
          >
            MAID CAFE POS
          </p>
          <h2 className="admin-title">Admin</h2>
        </div>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Link href="/" className="admin-switch-view">
            Main Dashboard
          </Link>
          <Link href="/staff" className="admin-switch-view">
            Switch View
          </Link>
        </div>
      </header>

      <nav className="admin-nav" aria-label="Admin navigation">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="admin-nav-link">
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="admin-content">{children}</section>
    </main>
  );
}
