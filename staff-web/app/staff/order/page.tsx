"use client";

import { useEffect, useMemo, useState } from "react";

import { apiGet } from "@/lib/api";
import type { SessionTableListResponse, SessionTableSummary } from "@/lib/types";

const CUSTOMER_WEB_BASE =
  process.env.NEXT_PUBLIC_CUSTOMER_WEB_BASE_URL ?? "http://localhost:3001";

function tableNumber(code: string) {
  const match = code.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

export default function MaidOrderingPage() {
  const [data, setData] = useState<SessionTableListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setData(await apiGet<SessionTableListResponse>("/staff/tables"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const tables = useMemo(
    () => [...(data?.tables ?? [])].sort((a, b) => tableNumber(a.table_code) - tableNumber(b.table_code)),
    [data],
  );

  function openOrdering(table: SessionTableSummary) {
    const url = `${CUSTOMER_WEB_BASE}/order/${encodeURIComponent(table.table_code)}?source=staff`;
    window.location.href = url;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Maid Ordering</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>
          Select a table, then use the full customer menu in staff-order mode.
        </p>
      </div>

      {error ? <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 12 }}>{error}</div> : null}
      {loading ? <p>Loading tables...</p> : null}

      {!loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
          {tables.map((table) => (
            <button
              type="button"
              key={table.id}
              onClick={() => openOrdering(table)}
              style={{ textAlign: "left", padding: 18, borderRadius: 16, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              <strong style={{ display: "block", fontSize: 22, marginBottom: 8 }}>Table {table.table_code}</strong>
              <span style={{ display: "block", color: "#6b7280" }}>
                {table.current_party_size}/{table.seats} guests · ${Number(table.open_bill_total || 0).toFixed(2)} open
              </span>
              <span style={{ display: "block", marginTop: 12, fontWeight: 700 }}>Open Menu →</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
