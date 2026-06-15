import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/admin/maids", label: "Maids" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/session-tables", label: "Session Tables" },
  { href: "/admin/session-maids", label: "Session Maids" },
  { href: "/admin/tables", label: "Tables" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/menu-items", label: "Menu Items" },
];

const linkStyle = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
} as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7fb",
        color: "#111827",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>Staff Admin</div>
            <div style={{ color: "#6b7280", marginTop: 4 }}>
              Configure sessions, tables, menu, and staff.
            </div>
          </div>

          <Link
            href="/staff"
            style={{
              ...linkStyle,
              background: "#111827",
              color: "#ffffff",
              borderColor: "#111827",
            }}
          >
            Switch View
          </Link>
        </header>

        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} style={linkStyle}>
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </main>
  );
}
