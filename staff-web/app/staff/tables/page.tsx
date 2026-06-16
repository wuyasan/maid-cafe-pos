"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import type {
  SessionTableListResponse,
  SessionTableSummary,
} from "@/lib/types";

function money(value?: string | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function tableAppearance(table: SessionTableSummary) {
  if (table.status === "paying") {
    return {
      label: "Checking out",
      background: "#fef3c7",
      border: "#f59e0b",
      color: "#92400e",
    };
  }

  if (table.current_party_size === 0) {
    return {
      label: "Empty",
      background: "#dcfce7",
      border: "#22c55e",
      color: "#166534",
    };
  }

  if (table.current_party_size >= table.seats) {
    return {
      label: "Full",
      background: "#fee2e2",
      border: "#ef4444",
      color: "#991b1b",
    };
  }

  return {
    label: "Seated",
    background: "#dbeafe",
    border: "#3b82f6",
    color: "#1d4ed8",
  };
}

export default function StaffTablesPage() {
  const [data, setData] = useState<SessionTableListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(showLoading = false) {
    if (showLoading) setLoading(true);

    try {
      setError("");
      setData(await apiGet<SessionTableListResponse>("/staff/tables"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(false), 10000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "24px 18px 60px",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Front / Floor Map</h1>
          <p style={{ margin: "7px 0 0", color: "#64748b" }}>
            {data ? `Current Session: ${data.session_name}` : "Loading session"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load(true)}
          style={{
            minHeight: 42,
            padding: "9px 15px",
            borderRadius: 11,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 800,
          }}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div
          style={{
            padding: 13,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#b91c1c",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? <p>Loading floor map...</p> : null}

      {!loading && data ? (
        <>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
              color: "#475569",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <span>🟢 Empty</span>
            <span>🔵 Seated</span>
            <span>🔴 Full</span>
            <span>🟡 Checking out</span>
          </div>

          <section
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 10",
              minHeight: 500,
              border: "2px solid #e2e8f0",
              borderRadius: 22,
              background:
                "radial-gradient(circle at 25% 20%, #ffffff 0, #f8fafc 65%, #f1f5f9 100%)",
              overflow: "hidden",
              boxShadow: "inset 0 0 30px rgba(15,23,42,.04)",
            }}
          >
            {data.tables.map((table) => {
              const appearance = tableAppearance(table);
              const remaining = Math.max(
                0,
                table.seats - table.current_party_size,
              );

              return (
                <Link
                  key={table.id}
                  href={`/staff/table/${encodeURIComponent(table.table_code)}`}
                  style={{
                    position: "absolute",
                    left: `${table.layout_x}%`,
                    top: `${table.layout_y}%`,
                    width: `${table.layout_width}%`,
                    height: `${table.layout_height}%`,
                    minWidth: 90,
                    minHeight: 82,
                    borderRadius:
                      table.layout_shape === "round" ? "50%" : 18,
                    border: `3px solid ${appearance.border}`,
                    background: appearance.background,
                    color: appearance.color,
                    textDecoration: "none",
                    boxShadow: "0 10px 22px rgba(15,23,42,.13)",
                    padding: 10,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                    overflow: "hidden",
                  }}
                >
                  <span>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "clamp(18px, 2.4vw, 30px)",
                        lineHeight: 1,
                      }}
                    >
                      {table.table_code}
                    </strong>

                    <span
                      style={{
                        display: "block",
                        marginTop: 5,
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {appearance.label}
                    </span>

                    <span
                      style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: 11,
                        color: "#334155",
                        fontWeight: 750,
                      }}
                    >
                      {table.current_party_size}/{table.seats} guests
                      {table.is_shareable ? " · Shareable" : ""}
                    </span>

                    {Number(table.open_bill_total || 0) > 0 ? (
                      <span
                        style={{
                          display: "block",
                          marginTop: 4,
                          fontSize: 12,
                          color: "#111827",
                          fontWeight: 900,
                        }}
                      >
                        Unpaid {money(table.open_bill_total)}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "block",
                          marginTop: 4,
                          fontSize: 11,
                          color: "#64748b",
                        }}
                      >
                        {remaining} seat(s) left
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </section>
        </>
      ) : null}
    </main>
  );
}
