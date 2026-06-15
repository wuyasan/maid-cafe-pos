import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/maids", label: "Maids" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/session-tables", label: "Session Tables" },
  { href: "/admin/session-maids", label: "Session Maids" },
  { href: "/admin/tables", label: "Tables" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/menu-items", label: "Menu Items" },
  { href: "/staff/tables", label: "Staff Tables" },
];

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f7f7fb" }}>
      <aside
        style={{
          width: 240,
          padding: 24,
          borderRight: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Staff Admin</h2>

        <nav style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: "none",
                color: "#111827",
                padding: "10px 12px",
                borderRadius: 10,
                background: "#f3f4f6",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 32 }}>{children}</main>
    </div>
  );
}