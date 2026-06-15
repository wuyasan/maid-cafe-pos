"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  findStaffView,
  STAFF_VIEWS,
  STAFF_VIEW_STORAGE_KEY,
  type StaffViewDefinition,
  type StaffViewId,
} from "@/lib/staffViews";

export default function StaffViewSelectorPage() {
  const router = useRouter();
  const [lastViewId, setLastViewId] = useState<StaffViewId | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STAFF_VIEW_STORAGE_KEY);
    const savedView = findStaffView(saved);
    setLastViewId(savedView?.id ?? null);
    setStorageReady(true);
  }, []);

  const lastView = findStaffView(lastViewId);

  function openView(view: StaffViewDefinition) {
    window.localStorage.setItem(STAFF_VIEW_STORAGE_KEY, view.id);
    setLastViewId(view.id);
    router.push(view.href);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "clamp(24px, 5vw, 64px) 20px",
        background:
          "radial-gradient(circle at top left, #fce7f3 0, transparent 32%), radial-gradient(circle at top right, #dbeafe 0, transparent 28%), #f8fafc",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 30 }}>
          <div
            style={{
              display: "inline-flex",
              padding: "6px 11px",
              borderRadius: 999,
              background: "#111827",
              color: "#fff",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.08em",
            }}
          >
            MAID CAFE POS
          </div>
          <h1
            style={{
              margin: "16px 0 8px",
              fontSize: "clamp(34px, 6vw, 58px)",
              lineHeight: 1.04,
            }}
          >
            Choose Staff View
          </h1>
          <p style={{ margin: 0, color: "#4b5563", fontSize: 18, lineHeight: 1.6 }}>
            选择这台设备现在要使用的工作界面。这里不会自动跳转，随时都能回来切换。
          </p>
        </div>

        {storageReady && lastView ? (
          <section
            style={{
              marginBottom: 26,
              padding: 20,
              borderRadius: 20,
              border: "1px solid #c7d2fe",
              background: "rgba(238,242,255,0.92)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ color: "#4338ca", fontSize: 12, fontWeight: 900 }}>
                LAST USED
              </div>
              <div style={{ marginTop: 5, fontSize: 22, fontWeight: 850 }}>
                {lastView.emoji} {lastView.title} · {lastView.subtitle}
              </div>
              <div style={{ marginTop: 5, color: "#4b5563" }}>{lastView.description}</div>
            </div>
            <button
              type="button"
              onClick={() => openView(lastView)}
              style={{
                minHeight: 48,
                padding: "11px 18px",
                border: 0,
                borderRadius: 13,
                background: "#4338ca",
                color: "#fff",
                fontWeight: 850,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Open Last Used
            </button>
          </section>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          {STAFF_VIEWS.map((view) => {
            const isLastUsed = lastViewId === view.id;

            return (
              <button
                key={view.id}
                type="button"
                onClick={() => openView(view)}
                style={{
                  minHeight: 245,
                  textAlign: "left",
                  padding: 22,
                  borderRadius: 22,
                  border: isLastUsed ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: "rgba(255,255,255,0.94)",
                  boxShadow: "0 10px 30px rgba(17,24,39,0.07)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = "translateY(-3px)";
                  event.currentTarget.style.boxShadow = "0 16px 38px rgba(17,24,39,0.12)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                  event.currentTarget.style.boxShadow = "0 10px 30px rgba(17,24,39,0.07)";
                }}
              >
                <div style={{ fontSize: 46 }}>{view.emoji}</div>
                <div style={{ marginTop: 20, fontSize: 23, fontWeight: 900 }}>{view.title}</div>
                <div style={{ marginTop: 4, color: "#6b7280", fontWeight: 750 }}>
                  {view.subtitle}
                </div>
                <div style={{ marginTop: 14, color: "#4b5563", lineHeight: 1.55 }}>
                  {view.description}
                </div>
                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: 20,
                    color: "#111827",
                    fontWeight: 850,
                  }}
                >
                  Open View →
                </div>
              </button>
            );
          })}
        </div>

        <p style={{ margin: "24px 0 0", color: "#6b7280", fontSize: 13 }}>
          这只是界面选择，不是账号权限控制。知道网址的人仍然可以直接打开其他页面。
        </p>
      </div>
    </div>
  );
}
