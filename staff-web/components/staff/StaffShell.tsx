"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import {
  findStaffView,
  getStaffViewFromPath,
  STAFF_VIEW_STORAGE_KEY,
} from "@/lib/staffViews";

type Props = {
  children: ReactNode;
};

export default function StaffShell({ children }: Props) {
  const pathname = usePathname();
  const currentViewId = getStaffViewFromPath(pathname);
  const currentView = findStaffView(currentViewId);
  const isSelectorPage = pathname === "/staff" || pathname === "/staff/";

  useEffect(() => {
    if (!currentViewId) return;
    window.localStorage.setItem(STAFF_VIEW_STORAGE_KEY, currentViewId);
  }, [currentViewId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        color: "#111827",
      }}
    >
      {!isSelectorPage ? (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            borderBottom: "1px solid #e5e7eb",
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              minHeight: 68,
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                CURRENT VIEW
              </div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {currentView
                  ? `${currentView.emoji} ${currentView.title} · ${currentView.subtitle}`
                  : "Staff"}
              </div>
            </div>

            <Link
              href="/staff"
              style={{
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 16px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                textDecoration: "none",
                fontWeight: 750,
              }}
            >
              Switch View
            </Link>
          </div>
        </header>
      ) : null}

      <main
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: isSelectorPage ? 0 : "24px 20px 48px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
