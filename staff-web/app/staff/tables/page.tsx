"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import type { SessionTableListResponse, SessionTableSummary } from "@/lib/types";

function money(v?: string | null) {
  return `$${Number(v || 0).toFixed(2)}`;
}

function getStatusStyle(status: string) {
  switch (status) {
    case "available":
      return { background: "#dcfce7", color: "#166534" };
    case "occupied":
      return { background: "#dbeafe", color: "#1d4ed8" };
    case "ready":
      return { background: "#fef3c7", color: "#92400e" };
    case "paying":
      return { background: "#fde68a", color: "#92400e" };
    case "paid":
      return { background: "#e5e7eb", color: "#374151" };
    default:
      return { background: "#e5e7eb", color: "#374151" };
  }
}

function extractTableNumber(code: string) {
  const match = code.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

export default function StaffTablesPage() {
  const [data, setData] = useState<SessionTableListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTables() {
    setLoading(true);
    setError("");

    try {
      const result = await apiGet<SessionTableListResponse>("/staff/tables");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff tables");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, []);

  const sortedTables = useMemo(() => {
    if (!data) return [];
    return [...data.tables].sort((a, b) => {
      const numDiff = extractTableNumber(a.table_code) - extractTableNumber(b.table_code);
      if (numDiff !== 0) return numDiff;
      return a.table_code.localeCompare(b.table_code);
    });
  }, [data]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 8 }}>Staff Tables</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>
            {data ? `Current Session: ${data.session_name}` : "Current session overview"}
          </p>
        </div>

        <Link
          href="/admin"
          style={{
            textDecoration: "none",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            color: "#111827",
            background: "#fff",
          }}
        >
          Back to Admin
        </Link>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error && data ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 18,
          }}
        >
          {sortedTables.map((table: SessionTableSummary) => {
            const statusStyle = getStatusStyle(table.status);

            return (
              <div
                key={table.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 18,
                  padding: 18,
                  display: "grid",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 800,
                        lineHeight: 1,
                      }}
                    >
                      {table.table_code}
                    </div>
                    <div style={{ marginTop: 8, color: "#6b7280", fontSize: 14 }}>
                      {table.seats} seats
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      ...statusStyle,
                    }}
                  >
                    {table.status}
                  </span>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "#f9fafb",
                    display: "grid",
                    gap: 6,
                    fontSize: 14,
                  }}
                >
                  <div>Bill: {table.open_bill_id ? `#${table.open_bill_id}` : "No open bill"}</div>
                  <div>Total: {money(table.open_bill_total)}</div>
                  <div>Party Size: {table.current_party_size}</div>
                  <div>Remaining Seats: {Math.max(0, table.seats - table.current_party_size)}</div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <Link
                    href={`/staff/table/${table.table_code}`}
                    style={{
                      textDecoration: "none",
                      textAlign: "center",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    Open Order
                  </Link>

                  <Link
                    href={`/staff/table/${table.table_code}`}
                    style={{
                      textDecoration: "none",
                      textAlign: "center",
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#111827",
                    }}
                  >
                    Checkout
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}