"use client";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition, useSyncExternalStore } from "react";
import { logoutAction } from "@/lib/server/actions/auth";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import { STAFF_VIEWS } from "@/lib/staffViews";
import type { SessionRead } from "@/lib/types";

// useSyncExternalStore subscriber for the sound localStorage key.
// Re-subscribes on storage events so multi-tab changes are reflected.
function subscribeSoundPref(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

interface StaffShellProps {
  session: SessionRead | null;
  children: React.ReactNode;
  /** Optional pending counts for production station badges (kitchen/bar/runner). */
  pendingCounts?: { kitchen?: number; bar?: number; runner?: number };
}

const SIDEBAR_NARROW = 60; // px — icon-only on small screens
const SIDEBAR_WIDE = 198; // px — icon + label on md+

/** Deep-dark sidebar + main content area for all staff views.
 *
 * Layout: fixed left sidebar (198 px on md+, 60 px icon-only on sm) + scrollable
 * main content shifted by the same offset. Minimum tap target ≥ 44 px throughout.
 */
export function StaffShell({ session, children, pendingCounts }: StaffShellProps) {
  const t = useTranslations("staff");
  const locale = useLocale() as "en" | "zh";
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Sound toggle — use useSyncExternalStore to read localStorage (client-only) with a
  // stable server snapshot of `true` to avoid SSR/client hydration mismatch.
  // The local useState tracks optimistic toggles before the next storage read.
  const storedSoundOn = useSyncExternalStore(
    subscribeSoundPref,
    isSoundEnabled,
    () => true, // server snapshot: default on
  );
  const [optimisticSoundOn, setOptimisticSoundOn] = useState<boolean | null>(null);
  const soundOn = optimisticSoundOn ?? storedSoundOn;

  function handleSoundToggle() {
    const next = !soundOn;
    setOptimisticSoundOn(next);
    setSoundEnabled(next);
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
      window.location.replace("/login");
    });
  }

  return (
    <>
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
        .staff-sidebar { width: ${SIDEBAR_NARROW}px; }
        .staff-main    { margin-left: ${SIDEBAR_NARROW}px; }
        @media (min-width: 768px) {
          .staff-sidebar { width: ${SIDEBAR_WIDE}px; }
          .staff-main    { margin-left: ${SIDEBAR_WIDE}px; }
        }
        .staff-nav-item:hover { background: rgba(255,255,255,0.05) !important; }
        .staff-nav-item-active:hover { background: #C9486A !important; }
      `}</style>

      <div className="flex min-h-screen">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <nav
          aria-label={t("nav.aria")}
          className="staff-sidebar fixed inset-y-0 left-0 z-30 flex flex-col"
          style={{ background: "#2A2024" }}
        >
          {/* ── Logo area ─────────────────────────────────── */}
          <div className="flex items-center gap-2.5 px-3 py-4 md:px-3.5">
            {/* 30px rounded-9px heart icon */}
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                minWidth: 30,
                borderRadius: 9,
                background: "#C9486A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                viewBox="0 0 16 16"
                fill="white"
                xmlns="http://www.w3.org/2000/svg"
                style={{ width: 14, height: 14 }}
                aria-hidden="true"
              >
                <path d="M8 13.5C8 13.5 1.5 9.5 1.5 5.5C1.5 3.567 3.067 2 5 2C6.12 2 7.12 2.538 7.77 3.383C7.855 3.495 7.928 3.553 8 3.553C8.072 3.553 8.145 3.495 8.23 3.383C8.88 2.538 9.88 2 11 2C12.933 2 14.5 3.567 14.5 5.5C14.5 9.5 8 13.5 8 13.5Z" />
              </svg>
            </span>
            {/* Brand text — hidden on narrow */}
            <div className="hidden flex-col md:flex" style={{ minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "var(--font-display-stack)",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "#fff",
                  lineHeight: 1.2,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                }}
              >
                Moonlight
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "#8A7873",
                  letterSpacing: "0.1em",
                  fontWeight: 500,
                  lineHeight: 1.4,
                  whiteSpace: "nowrap",
                }}
              >
                MAID CAFÉ POS
              </span>
            </div>
          </div>

          {/* ── Session card ─────────────────────────────── */}
          <div className="hidden px-3 pb-3 md:block md:px-3.5">
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "11px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  color: "#9A8388",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                  marginBottom: 5,
                }}
              >
                {locale === "zh" ? "今夜场·TONIGHT" : "TONIGHT"}
              </div>
              {session ? (
                <>
                  <div className="flex items-center gap-1.5">
                    {/* Live dot */}
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#8FCBA8",
                        display: "inline-block",
                        animation: "livePulse 2s ease-in-out infinite",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "#8FCBA8",
                        lineHeight: 1.3,
                      }}
                    >
                      {locale === "zh" ? "进行中 In Service" : "In Service"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "#7A6A66",
                      marginTop: 3,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {session.name}
                  </div>
                </>
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: "#6A5A5E",
                    fontWeight: 500,
                  }}
                >
                  {locale === "zh" ? "无活动场次" : "No active session"}
                </span>
              )}
            </div>
          </div>

          {/* ── Section label ─────────────────────────────── */}
          <div
            className="hidden px-3 pb-1.5 md:block md:px-3.5"
            style={{
              fontSize: 10,
              color: "#7A6A66",
              letterSpacing: "0.16em",
              fontWeight: 600,
              paddingTop: 4,
            }}
          >
            {locale === "zh" ? "视图 VIEWS" : "VIEWS"}
          </div>

          {/* ── Nav links ─────────────────────────────────── */}
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-1 md:px-2">
            {STAFF_VIEWS.map((view) => {
              // Admin link is rendered in the footer section — skip here
              if (view.id === "admin") return null;

              const isActive =
                pathname === view.href || pathname.startsWith(view.href + "/");

              const badgeCount =
                view.id === "kitchen"
                  ? pendingCounts?.kitchen
                  : view.id === "bar"
                    ? pendingCounts?.bar
                    : view.id === "runner"
                      ? pendingCounts?.runner
                      : undefined;

              // Badge color per station per design spec
              const badgeBg =
                view.id === "kitchen"
                  ? "#D69A4E"
                  : view.id === "bar"
                    ? "#8A7873"
                    : view.id === "runner"
                      ? "#7BAE8E"
                      : undefined;

              return (
                <Link
                  key={view.id}
                  href={view.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`staff-nav-item${isActive ? " staff-nav-item-active" : ""} flex items-center transition-colors`}
                  style={{
                    padding: "11px 12px",
                    gap: 11,
                    borderRadius: 12,
                    minHeight: "var(--tap-min)",
                    background: isActive ? "#C9486A" : "transparent",
                    color: isActive ? "#fff" : "#C8B9B4",
                    boxShadow: isActive
                      ? "0 8px 16px -8px rgba(201,72,106,0.9)"
                      : "none",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {/* 19×19 icon */}
                  <span
                    style={{
                      width: 19,
                      height: 19,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    // Safe: icon strings are our own static literals defined in staffViews.ts
                    dangerouslySetInnerHTML={{ __html: view.icon }}
                    aria-hidden="true"
                  />
                  <span
                    className="hidden md:flex flex-1 items-center justify-between"
                    style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }}
                  >
                    {view.label[locale]}
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <span
                        style={{
                          background: badgeBg,
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          lineHeight: 1.4,
                          flexShrink: 0,
                        }}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* ── Footer ─────────────────────────────────────── */}
          <div
            className="flex flex-col px-1.5 pb-4 pt-3.5 md:px-2"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              gap: 8,
            }}
          >
            {/* Sound toggle */}
            <button
              type="button"
              onClick={handleSoundToggle}
              aria-label={t("nav.soundToggle")}
              aria-pressed={soundOn}
              className="flex items-center justify-between w-full"
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                minHeight: "var(--tap-min)",
                cursor: "pointer",
                background: "transparent",
                border: "none",
              }}
            >
              {/* Left: icon + label */}
              <div className="flex items-center gap-[9px]">
                <SoundIcon muted={!soundOn} />
                <span
                  className="hidden md:block"
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#C8B9B4" }}
                >
                  {t("nav.sound")}
                </span>
              </div>
              {/* Right: 38×22 pill toggle — hidden on narrow */}
              <div
                className="hidden md:block"
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 22,
                  borderRadius: 999,
                  background: soundOn ? "#7BAE8E" : "rgba(255,255,255,0.12)",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    top: 3,
                    ...(soundOn ? { right: 3 } : { left: 3 }),
                    transition: "left 0.2s, right 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }}
                />
              </div>
            </button>

            {/* Admin link */}
            <Link
              href="/admin"
              className="staff-nav-item flex items-center transition-colors"
              style={{
                padding: "9px 9px 8px",
                gap: 9,
                borderRadius: 12,
                minHeight: "var(--tap-min)",
                color: "#C8B9B4",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 19,
                  height: 19,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 19, height: 19 }}
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="18" cy="18" r="3" />
                  <path d="m21 21-1.5-1.5" />
                </svg>
              </span>
              <span
                className="hidden md:block"
                style={{ fontSize: 12.5, fontWeight: 600, color: "#C8B9B4" }}
              >
                {locale === "zh" ? "管理 Admin" : "Admin"}
              </span>
            </Link>

            {/* User / logout row */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isPending}
              aria-label={t("nav.logout")}
              className="staff-nav-item flex items-center w-full transition-colors"
              style={{
                padding: "9px 9px 8px",
                gap: 9,
                borderRadius: 12,
                minHeight: "var(--tap-min)",
                background: "transparent",
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.5 : 1,
                textAlign: "left",
                display: "flex",
                alignItems: "center",
              }}
            >
              {/* Avatar circle */}
              <span
                aria-hidden="true"
                style={{
                  width: 30,
                  height: 30,
                  minWidth: 30,
                  borderRadius: "50%",
                  background: "#4A3138",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#E8D5DA",
                }}
              >
                员
              </span>
              {/* Name + status — hidden on narrow */}
              <div className="hidden flex-col md:flex" style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {locale === "zh" ? "员工 Staff" : "Staff"}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "#8A7873",
                    lineHeight: 1.3,
                  }}
                >
                  {isPending
                    ? locale === "zh"
                      ? "退出中…"
                      : "Signing out…"
                    : locale === "zh"
                      ? "退出登录"
                      : "Log out"}
                </span>
              </div>
            </button>
          </div>
        </nav>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div className="staff-main flex-1 min-h-screen">{children}</div>
      </div>
    </>
  );
}

// ── Icon sub-components ───────────────────────────────────────────────────────

function SoundIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 19, height: 19, flexShrink: 0, color: "#C8B9B4" }}
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        /* X lines when muted */
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        /* Sound waves when on */
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}
