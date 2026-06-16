"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useEffect,
} from "react";

import {
  findStaffView,
  getStaffViewFromPath,
  STAFF_VIEW_STORAGE_KEY,
} from "@/lib/staffViews";

type Props = {
  children: ReactNode;
};

export default function StaffShell({
  children,
}: Props) {
  const pathname = usePathname();

  const currentViewId =
    getStaffViewFromPath(pathname);
  const currentView =
    findStaffView(currentViewId);

  const isSelectorPage =
    pathname === "/staff" ||
    pathname === "/staff/";

  useEffect(() => {
    if (!currentViewId) {
      return;
    }

    window.localStorage.setItem(
      STAFF_VIEW_STORAGE_KEY,
      currentViewId,
    );
  }, [currentViewId]);

  return (
    <>
      {!isSelectorPage ? (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            borderBottom:
              "1px solid #e5e7eb",
            background:
              "rgba(255,255,255,.96)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "12px 18px",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  color: "#6b7280",
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: ".1em",
                }}
              >
                CURRENT VIEW
              </div>

              <strong>
                {currentView
                  ? `${currentView.emoji} ${currentView.title} · ${currentView.subtitle}`
                  : "Staff"}
              </strong>
            </div>

            <nav
              style={{
                display: "flex",
                gap: 9,
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/"
                style={{
                  padding: "10px 15px",
                  borderRadius: 11,
                  border:
                    "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  textDecoration: "none",
                  fontWeight: 850,
                }}
              >
                Main Dashboard
              </Link>

              <Link
                href="/staff"
                style={{
                  padding: "10px 15px",
                  borderRadius: 11,
                  background: "#4f46e5",
                  color: "#ffffff",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Switch View
              </Link>
            </nav>
          </div>
        </header>
      ) : null}

      {children}
    </>
  );
}
