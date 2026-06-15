"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { SessionSummaryResponse } from "@/lib/types";

type Props = {
  params: Promise<{ sessionId: string }>;
};

function money(v?: string | null) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function SessionSummaryPage({ params }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [data, setData] = useState<SessionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((p) => setSessionId(p.sessionId));
  }, [params]);

  useEffect(() => {
    async function loadSummary() {
      if (!sessionId) return;

      setLoading(true);
      setError("");

      try {
        const result = await apiGet<SessionSummaryResponse>(
          `/staff/session-summary/${sessionId}`
        );
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session summary");
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, [sessionId]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Session Summary</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>
            {data ? data.session_name : `Session #${sessionId}`}
          </p>
        </div>

        <Link
          href="/admin/sessions"
          style={{
            textDecoration: "none",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            color: "#111827",
            background: "#fff",
          }}
        >
          Back to Sessions
        </Link>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error && data ? (
        <div style={{ display: "grid", gap: 16 }}>
          {data.items.length === 0 ? <p>No orders yet for this session.</p> : null}

          {data.items.map((item) => (
            <section
              key={item.menu_item_id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 20,
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong>{item.menu_item_name}</strong>
                  <div style={{ color: "#6b7280", fontSize: 14 }}>{item.item_type}</div>
                </div>
                <div style={{ fontWeight: 700 }}>Total ordered: {item.total_ordered}</div>
                <div style={{ color: "#059669", fontWeight: 700 }}>
                  Total sales: {money(item.total_sales)}
                </div>
              </div>

              {item.item_type === "maid_service" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>Maid Breakdown</strong>
                  {item.maid_breakdown.length === 0 ? (
                    <div style={{ color: "#6b7280" }}>No maid selections yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {item.maid_breakdown.map((maid) => (
                        <div
                          key={`${item.menu_item_id}-${maid.maid_id}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: 10,
                            background: "#f9fafb",
                          }}
                        >
                          <span>{maid.maid_name}</span>
                          <span>{maid.total_ordered}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}