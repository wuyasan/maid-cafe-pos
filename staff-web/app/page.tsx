"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  findStaffView,
  STAFF_VIEWS,
  STAFF_VIEW_STORAGE_KEY,
  type StaffViewDefinition,
} from "@/lib/staffViews";

const CUSTOMER_TABLE_STORAGE_KEY = "maid-cafe-pos:last-customer-table";

function customerWebBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_WEB_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

export default function UnifiedDashboardPage() {
  const router = useRouter();

  const [lastStaffViewId, setLastStaffViewId] = useState<string | null>(null);
  const [tableCode, setTableCode] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLastStaffViewId(
      window.localStorage.getItem(STAFF_VIEW_STORAGE_KEY),
    );

    setTableCode(
      window.localStorage.getItem(CUSTOMER_TABLE_STORAGE_KEY) ?? "",
    );

    setReady(true);
  }, []);

  const lastStaffView = useMemo(
    () => findStaffView(lastStaffViewId),
    [lastStaffViewId],
  );

  function openStaffView(view: StaffViewDefinition) {
    window.localStorage.setItem(STAFF_VIEW_STORAGE_KEY, view.id);
    setLastStaffViewId(view.id);
    router.push(view.href);
  }

  function openCustomerOrder() {
    const normalized = tableCode.trim().toUpperCase();

    if (!normalized) {
      return;
    }

    window.localStorage.setItem(CUSTOMER_TABLE_STORAGE_KEY, normalized);

    window.location.href = `${customerWebBaseUrl()}/order/${encodeURIComponent(
      normalized,
    )}`;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #f5f3ff 0%, #fdf2f8 44%, #f8fafc 100%)",
        padding: "38px 18px 64px",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              color: "#7c3aed",
              fontWeight: 900,
              letterSpacing: "0.12em",
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            MAID CAFE POS
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 6vw, 58px)",
              lineHeight: 1.03,
            }}
          >
            Choose an interface
          </h1>

          <p
            style={{
              margin: "13px 0 0",
              color: "#64748b",
              fontSize: 17,
              maxWidth: 720,
              lineHeight: 1.65,
            }}
          >
            顾客点单和所有 Staff 工作界面都从这里进入。页面不会自动跳转，
            上次使用的入口只会作为快捷选项显示。
          </p>
        </header>

        <section
          style={{
            padding: 24,
            borderRadius: 24,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid #e9d5ff",
            boxShadow: "0 14px 40px rgba(76, 29, 149, 0.09)",
            marginBottom: 26,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 420px)",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🛍️</div>
              <h2 style={{ margin: 0, fontSize: 27 }}>Customer Ordering</h2>
              <p
                style={{
                  margin: "9px 0 0",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                输入桌号后打开顾客点单页面。这个入口不会使用 Staff Order
                模式。
              </p>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label
                htmlFor="customer-table-code"
                style={{ fontWeight: 850, color: "#374151" }}
              >
                Table code
              </label>

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  id="customer-table-code"
                  value={tableCode}
                  onChange={(event) =>
                    setTableCode(event.target.value.toUpperCase())
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      openCustomerOrder();
                    }
                  }}
                  placeholder="Example: T1"
                  style={{
                    minWidth: 0,
                    flex: 1,
                    minHeight: 50,
                    padding: "11px 14px",
                    borderRadius: 13,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: 17,
                    fontWeight: 750,
                    outline: "none",
                  }}
                />

                <button
                  type="button"
                  disabled={!tableCode.trim()}
                  onClick={openCustomerOrder}
                  style={{
                    minHeight: 50,
                    padding: "11px 18px",
                    border: 0,
                    borderRadius: 13,
                    background: "#7c3aed",
                    color: "#ffffff",
                    fontWeight: 900,
                    cursor: tableCode.trim() ? "pointer" : "not-allowed",
                    opacity: tableCode.trim() ? 1 : 0.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  Open Menu
                </button>
              </div>
            </div>
          </div>
        </section>

        {ready && lastStaffView ? (
          <section
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              padding: "17px 19px",
              borderRadius: 17,
              border: "1px solid #c7d2fe",
              background: "#eef2ff",
              marginBottom: 24,
            }}
          >
            <div>
              <div
                style={{
                  color: "#4338ca",
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  marginBottom: 4,
                }}
              >
                LAST STAFF VIEW
              </div>
              <strong style={{ fontSize: 18 }}>
                {lastStaffView.emoji} {lastStaffView.title}
              </strong>
              <span style={{ color: "#64748b" }}>
                {" "}
                · {lastStaffView.subtitle}
              </span>
            </div>

            <button
              type="button"
              onClick={() => openStaffView(lastStaffView)}
              style={{
                minHeight: 44,
                padding: "10px 17px",
                borderRadius: 12,
                border: 0,
                background: "#4338ca",
                color: "#ffffff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Open Last Used
            </button>
          </section>
        ) : null}

        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "end",
              marginBottom: 14,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 27 }}>Staff Interfaces</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                选择这台设备当前需要使用的工作界面。
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {STAFF_VIEWS.map((view) => {
              const isLast = lastStaffView?.id === view.id;

              return (
                <button
                  type="button"
                  key={view.id}
                  onClick={() => openStaffView(view)}
                  style={{
                    minHeight: 220,
                    padding: 21,
                    borderRadius: 21,
                    border: isLast
                      ? "2px solid #6366f1"
                      : "1px solid #e5e7eb",
                    background: "rgba(255,255,255,0.95)",
                    color: "#111827",
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: "0 10px 28px rgba(15,23,42,0.07)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                  }}
                >
                  <div style={{ fontSize: 36, minHeight: 44 }}>
                    {view.emoji || "•"}
                  </div>

                  <strong
                    style={{
                      marginTop: 12,
                      fontSize: 21,
                      display: "block",
                    }}
                  >
                    {view.title}
                  </strong>

                  <span
                    style={{
                      color: "#7c3aed",
                      fontWeight: 850,
                      marginTop: 5,
                    }}
                  >
                    {view.subtitle}
                  </span>

                  <span
                    style={{
                      color: "#64748b",
                      lineHeight: 1.55,
                      marginTop: 10,
                    }}
                  >
                    {view.description}
                  </span>

                  <span
                    style={{
                      marginTop: "auto",
                      paddingTop: 16,
                      color: "#4338ca",
                      fontWeight: 900,
                    }}
                  >
                    Open View →
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 760px) {
          section > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
