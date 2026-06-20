"use client";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logoutAction } from "@/lib/server/actions/auth";

// ─── Nav definition ──────────────────────────────────────────────────────────

interface AdminNavItem {
  href: string;
  label: { en: string; zh: string };
  sublabel: { en: string; zh: string };
  icon: string;
}

interface AdminNavGroup {
  groupKey: "session" | "catalog" | "layout";
  items: AdminNavItem[];
}

const ADMIN_NAV: AdminNavGroup[] = [
  {
    groupKey: "session",
    items: [
      {
        href: "/admin/sessions",
        label: { en: "Sessions", zh: "场次" },
        sublabel: { en: "Sessions", zh: "Sessions" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>`,
      },
      {
        href: "/admin/summary",
        label: { en: "Sales", zh: "销售汇总" },
        sublabel: { en: "Sales", zh: "Sales" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
      },
      {
        href: "/admin/session-maids",
        label: { en: "Session Maids", zh: "场次女仆" },
        sublabel: { en: "Roster", zh: "Roster" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 11h5M18.5 8.5v5"/></svg>`,
      },
      {
        href: "/admin/session-tables",
        label: { en: "Session Tables", zh: "场次配桌" },
        sublabel: { en: "Tables", zh: "Tables" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M6 19v-2M18 19v-2"/></svg>`,
      },
      {
        href: "/admin/staff-users",
        label: { en: "Staff Accounts", zh: "员工账号" },
        sublabel: { en: "Accounts", zh: "Accounts" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 4.5a3 3 0 0 1 0 6M17.5 14a5.2 5.2 0 0 1 3 5"/></svg>`,
      },
    ],
  },
  {
    groupKey: "catalog",
    items: [
      {
        href: "/admin/menu-items",
        label: { en: "Menu Items", zh: "菜单" },
        sublabel: { en: "Menu", zh: "Menu" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M4 12h16M4 19h10"/></svg>`,
      },
      {
        href: "/admin/categories",
        label: { en: "Categories", zh: "品类" },
        sublabel: { en: "Categories", zh: "Categories" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>`,
      },
      {
        href: "/admin/maids",
        label: { en: "Maids", zh: "女仆" },
        sublabel: { en: "Maids", zh: "Maids" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"/></svg>`,
      },
      {
        href: "/admin/maid-pricing",
        label: { en: "Maid Pricing", zh: "女仆定价" },
        sublabel: { en: "Pricing", zh: "Pricing" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.5-2.5 1.8-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/></svg>`,
      },
    ],
  },
  {
    groupKey: "layout",
    items: [
      {
        href: "/admin/tables",
        label: { en: "Tables", zh: "桌位" },
        sublabel: { en: "Tables", zh: "Tables" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M6 19v-2M18 19v-2"/></svg>`,
      },
      {
        href: "/admin/floor-plan",
        label: { en: "Floor Plan", zh: "平面图" },
        sublabel: { en: "Layout", zh: "Layout" },
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>`,
      },
    ],
  },
];

// ─── Layout constants ─────────────────────────────────────────────────────────

const SIDEBAR_NARROW = 60; // px — icon-only on small screens
const SIDEBAR_WIDE = 224; // px — matches design spec (224px)

// ─── AdminShell ───────────────────────────────────────────────────────────────

interface AdminShellProps {
  children: React.ReactNode;
}

/**
 * Deep-dark sidebar + main content area for all admin views.
 * Design spec: sidebar #2A2024, 224px wide, active item brand #C9486A fill + shadow.
 */
export function AdminShell({ children }: AdminShellProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as "en" | "zh";
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
      window.location.replace("/login");
    });
  }

  return (
    <>
      <style>{`
        .admin-sidebar { width: ${SIDEBAR_NARROW}px; }
        .admin-main    { margin-left: ${SIDEBAR_NARROW}px; }
        @media (min-width: 768px) {
          .admin-sidebar { width: ${SIDEBAR_WIDE}px; }
          .admin-main    { margin-left: ${SIDEBAR_WIDE}px; }
        }
      `}</style>

      <div className="flex min-h-screen" style={{ background: "var(--page-bg)" }}>
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <nav
          aria-label={t("nav.aria")}
          className="admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col"
          style={{ background: "#2A2024", borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Brand header */}
          <div
            className="flex items-center gap-3 px-3 py-5 md:px-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            {/* Logo mark */}
            <span
              className="flex shrink-0 items-center justify-center rounded-lg"
              style={{ width: 30, height: 30, background: "var(--brand)" }}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" fill="#fff" />
              </svg>
            </span>
            <div className="hidden flex-col md:flex">
              <span style={{ fontFamily: "var(--font-display-stack)", fontWeight: 700, fontSize: 15, color: "#fff", lineHeight: 1.1 }}>
                Admin
              </span>
              <span style={{ fontSize: 10, color: "#8A7873", letterSpacing: "0.08em" }}>
                MOONLIGHT
              </span>
            </div>
          </div>

          {/* Nav groups */}
          <div className="flex flex-1 flex-col overflow-y-auto py-3" style={{ padding: "12px 8px" }}>
            {ADMIN_NAV.map((group) => (
              <div key={group.groupKey} className="mb-2">
                {/* Group label — hidden on narrow sidebar */}
                <div
                  className="hidden px-3 pb-1.5 pt-3 md:block"
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "#7A6A66", textTransform: "uppercase" }}
                >
                  {t(`groups.${group.groupKey}`)}
                </div>

                {/* Divider on narrow */}
                <div
                  className="mx-2 my-2 block md:hidden"
                  style={{ height: 1, background: "rgba(255,255,255,0.08)" }}
                  aria-hidden="true"
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className="flex items-center gap-3"
                        style={{
                          minHeight: "var(--tap-min)",
                          padding: "10px 12px",
                          borderRadius: 11,
                          fontSize: 13.5,
                          fontWeight: 600,
                          textDecoration: "none",
                          background: isActive ? "var(--brand)" : "transparent",
                          color: isActive ? "#fff" : "#C8B9B4",
                          boxShadow: isActive ? "0 8px 16px -8px rgba(201,72,106,0.9)" : "none",
                          transition: "background 0.15s, color 0.15s",
                        }}
                      >
                        <span
                          className="shrink-0"
                          style={{ width: 18, height: 18 }}
                          // Safe: icon strings are our own static literals
                          dangerouslySetInnerHTML={{ __html: item.icon }}
                          aria-hidden="true"
                        />
                        <span className="hidden md:flex md:items-center md:gap-1.5">
                          {item.label[locale]}
                          {!isActive && (
                            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6 }}>
                              {item.sublabel.en}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer: back to staff + logout */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              padding: "10px 8px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {/* Back to Staff */}
            <Link
              href="/staff/floor"
              className="flex items-center gap-3"
              style={{
                minHeight: "var(--tap-min)",
                padding: "10px 12px",
                borderRadius: 11,
                color: "rgba(255,255,255,0.45)",
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              <BackIcon />
              <span className="hidden text-sm md:block">Staff</span>
            </Link>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={pending}
              aria-label={t("nav.logout")}
              className="flex items-center gap-3"
              style={{
                minHeight: "var(--tap-min)",
                padding: "10px 12px",
                borderRadius: 11,
                color: pending ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)",
                background: "transparent",
                border: "none",
                cursor: pending ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              <LogoutIcon />
              <span className="hidden text-sm md:block">{t("nav.logout")}</span>
            </button>
          </div>
        </nav>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div className="admin-main flex-1 min-h-screen">{children}</div>
      </div>
    </>
  );
}

// ── Icon sub-components ───────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 18, height: 18, flexShrink: 0 }}
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 18, height: 18, flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
