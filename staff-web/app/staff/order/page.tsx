"use client";

import { useEffect, useMemo, useState } from "react";

import { apiGet } from "@/lib/api";
import type {
  SessionTableListResponse,
  SessionTableSummary,
} from "@/lib/types";

function tableNumber(code: string) {
  const match = code.match(/\d+/);
  return match
    ? Number(match[0])
    : Number.MAX_SAFE_INTEGER;
}

function customerWebBase() {
  const configured =
    process.env.NEXT_PUBLIC_CUSTOMER_WEB_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:3001";
  }

  /*
   * iPad example:
   * staff page:    http://192.168.1.189:3000
   * customer page: http://192.168.1.189:3001
   */
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

export default function MaidOrderingPage() {
  const [data, setData] =
    useState<SessionTableListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);

    try {
      setError("");
      setData(
        await apiGet<SessionTableListResponse>(
          "/staff/tables",
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load tables",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);

    const timer = window.setInterval(() => {
      void load(false);
    }, 10000);

    return () => window.clearInterval(timer);
  }, []);

  const tables = useMemo(
    () =>
      [...(data?.tables ?? [])].sort(
        (a, b) =>
          tableNumber(a.table_code) -
            tableNumber(b.table_code) ||
          a.table_code.localeCompare(b.table_code),
      ),
    [data],
  );

  function openOrdering(table: SessionTableSummary) {
    const url =
      `${customerWebBase()}/order/` +
      `${encodeURIComponent(table.table_code)}?source=staff`;

    window.location.href = url;
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "24px 18px 64px",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Maid Ordering</h1>
          <p style={{ margin: "7px 0 0", color: "#64748b" }}>
            选择桌位后，在 Customer Web 中打开该桌 bill 和完整菜单。
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load(true)}
          style={{
            padding: "10px 14px",
            borderRadius: 11,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 850,
          }}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div
          style={{
            padding: 13,
            marginBottom: 16,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? <p>Loading tables...</p> : null}

      {!loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill,minmax(220px,1fr))",
            gap: 14,
          }}
        >
          {tables.map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => openOrdering(table)}
              style={{
                minHeight: 160,
                textAlign: "left",
                padding: 18,
                borderRadius: 16,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                boxShadow:
                  "0 8px 22px rgba(15,23,42,.06)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: 24,
                  marginBottom: 8,
                }}
              >
                Table {table.table_code}
              </strong>

              <span
                style={{
                  display: "block",
                  color: "#64748b",
                }}
              >
                {table.current_party_size}/{table.seats} guests
              </span>

              <span
                style={{
                  display: "block",
                  color: "#64748b",
                  marginTop: 4,
                }}
              >
                Open bill: $
                {Number(
                  table.open_bill_total || 0,
                ).toFixed(2)}
              </span>

              <span
                style={{
                  display: "block",
                  marginTop: 16,
                  color: "#4338ca",
                  fontWeight: 900,
                }}
              >
                Open Bill & Menu →
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
