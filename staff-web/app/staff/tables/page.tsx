"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiGet } from "@/lib/api";
import type {
  SessionTableListResponse,
  SessionTableSummary,
} from "@/lib/types";

function money(value?: string | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getSimpleStatus(table: SessionTableSummary) {
  if (table.status === "paying") {
    return {
      label: "Checking out",
      background: "#fef3c7",
      color: "#92400e",
      border: "#f59e0b",
    };
  }

  if (table.current_party_size === 0) {
    return {
      label: "Empty",
      background: "#dcfce7",
      color: "#166534",
      border: "#86efac",
    };
  }

  return {
    label: "Seated",
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "#93c5fd",
  };
}

function extractTableNumber(code: string) {
  const match = code.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

export default function StaffTablesPage() {
  const [data, setData] = useState<SessionTableListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTables(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const result = await apiGet<SessionTableListResponse>("/staff/tables");
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load staff tables",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadTables();

    const timer = window.setInterval(() => {
      loadTables(false);
    }, 10000);

    return () => window.clearInterval(timer);
  }, []);

  const sortedTables = useMemo(() => {
    if (!data) return [];

    return [...data.tables].sort((a, b) => {
      const numberDifference =
        extractTableNumber(a.table_code) - extractTableNumber(b.table_code);

      if (numberDifference !== 0) return numberDifference;
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
            {data
              ? `Current Session: ${data.session_name}`
              : "Current session overview"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => loadTables()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              color: "#111827",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>

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
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      ) : null}

      {!loading && !error && data && sortedTables.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          No tables are linked to the current session. Open Session Tables and
          click <strong>Sync All Active Tables</strong>.
        </div>
      ) : null}

      {!loading && !error && data ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          {sortedTables.map((table) => {
            const status = getSimpleStatus(table);
            const remainingSeats = Math.max(
              0,
              table.seats - table.current_party_size,
            );
            const isFull = remainingSeats === 0;

            let seatingMessage = `${remainingSeats} seat(s) available`;
            if (isFull) {
              seatingMessage = "Full";
            } else if (
              table.current_party_size > 0 &&
              !table.is_shareable
            ) {
              seatingMessage = "No additional party";
            }

            return (
              <article
                key={table.id}
                style={{
                  background: "#fff",
                  border: `2px solid ${status.border}`,
                  borderRadius: 18,
                  padding: 18,
                  display: "grid",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
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
                    <div
                      style={{
                        marginTop: 8,
                        color: "#6b7280",
                        fontSize: 14,
                      }}
                    >
                      {table.seats} seats · {table.is_shareable ? "Shareable" : "Private"}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: status.background,
                      color: status.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "#f9fafb",
                    display: "grid",
                    gap: 7,
                    fontSize: 14,
                  }}
                >
                  <div>
                    Guests: <strong>{table.current_party_size}</strong> / {table.seats}
                  </div>
                  <div>
                    Seating: <strong>{seatingMessage}</strong>
                  </div>
                  <div>
                    Bill: {table.open_bill_id ? `#${table.open_bill_id}` : "No open bill"}
                  </div>
                  <div>
                    Total: <strong>{money(table.open_bill_total)}</strong>
                  </div>
                </div>

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
                  Open Table
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
