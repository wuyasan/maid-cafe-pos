"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import type {
  SessionSummaryItem,
  SessionSummaryResponse,
} from "@/lib/types";

type Props = {
  params: Promise<{ sessionId: string }>;
};

function money(value?: string | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function ItemQuantitySummary({
  item,
}: {
  item: SessionSummaryItem;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 5,
        minWidth: 190,
        textAlign: "right",
      }}
    >
      <strong style={{ fontSize: 17 }}>
        Total units: {item.total_ordered}
      </strong>
      <span style={{ color: "#475569", fontSize: 13 }}>
        Direct: {item.direct_ordered}
        {item.from_sets > 0 ? ` · From sets: ${item.from_sets}` : ""}
      </span>
      <span style={{ color: "#059669", fontWeight: 800 }}>
        Direct sales: {money(item.total_sales)}
      </span>
    </div>
  );
}

export default function SessionSummaryPage({ params }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [data, setData] = useState<SessionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((value) => setSessionId(value.sessionId));
  }, [params]);

  useEffect(() => {
    async function loadSummary() {
      if (!sessionId) return;

      setLoading(true);
      setError("");

      try {
        const result = await apiGet<SessionSummaryResponse>(
          `/staff/session-summary/${sessionId}`,
        );
        setData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load session summary",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSummary();
  }, [sessionId]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
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

      <div
        style={{
          padding: 14,
          borderRadius: 13,
          background: "#eff6ff",
          color: "#1e3a8a",
          border: "1px solid #bfdbfe",
          fontSize: 14,
        }}
      >
        Total units include items ordered directly and items contained inside
        sets. “Direct sales” does not assign part of a set price to its
        components.
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error && data ? (
        <div style={{ display: "grid", gap: 16 }}>
          {data.items.length === 0 ? (
            <p>No orders yet for this session.</p>
          ) : null}

          {data.items.map((item) => (
            <section
              key={item.menu_item_id}
              style={{
                background: "#fff",
                border: item.is_bundle
                  ? "2px solid #a5b4fc"
                  : "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 20,
                display: "grid",
                gap: 15,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ fontSize: 18 }}>
                      {item.menu_item_name}
                    </strong>

                    {item.is_bundle ? (
                      <span
                        style={{
                          padding: "4px 9px",
                          borderRadius: 999,
                          background: "#e0e7ff",
                          color: "#3730a3",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        SET
                      </span>
                    ) : null}

                    {item.from_sets > 0 ? (
                      <span
                        style={{
                          padding: "4px 9px",
                          borderRadius: 999,
                          background: "#fef3c7",
                          color: "#92400e",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {item.from_sets} FROM SET
                      </span>
                    ) : null}
                  </div>

                  <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                    {item.item_type}
                  </div>
                </div>

                <ItemQuantitySummary item={item} />
              </div>

              {item.is_bundle && item.set_components.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 14,
                    borderRadius: 13,
                    background: "#f5f3ff",
                    border: "1px solid #ddd6fe",
                  }}
                >
                  <strong style={{ color: "#5b21b6" }}>Set contents</strong>

                  {item.set_components.map((component) => (
                    <div
                      key={`${item.menu_item_id}-${component.menu_item_id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#fff",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{component.menu_item_name}</span>
                      <span style={{ color: "#475569", fontWeight: 800 }}>
                        {component.quantity_per_set} per set ·{" "}
                        {component.total_quantity_from_set} total
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {item.from_set_breakdown.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 14,
                    borderRadius: 13,
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                  }}
                >
                  <strong style={{ color: "#92400e" }}>
                    From set breakdown
                  </strong>

                  {item.from_set_breakdown.map((source) => (
                    <div
                      key={`${item.menu_item_id}-${source.set_menu_item_id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#fff",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{source.set_menu_item_name}</span>
                      <span style={{ color: "#92400e", fontWeight: 800 }}>
                        {source.set_quantity_ordered} sets ×{" "}
                        {source.component_quantity_per_set} ={" "}
                        {source.quantity_from_set} units
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {item.item_type === "maid_service" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>Maid Breakdown</strong>

                  {item.maid_breakdown.length === 0 ? (
                    <div style={{ color: "#6b7280" }}>
                      No maid selections yet.
                    </div>
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
