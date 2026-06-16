"use client";

import { useEffect, useMemo, useState } from "react";

import { apiGet, apiPatch } from "@/lib/api";
import type {
  ProductionQueueItem,
  ProductionQueueResponse,
  ProductionStation,
  ProductionStatus,
} from "@/lib/productionTypes";

type Props = {
  station: ProductionStation;
};

const stationLabels: Record<ProductionStation, string> = {
  kitchen: "Kitchen",
  bar: "Bar",
};

function timeLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: ProductionStatus) {
  if (status === "pending") return "Waiting";
  if (status === "preparing") return "Preparing";
  return "Completed";
}

function statusStyle(status: ProductionStatus): React.CSSProperties {
  if (status === "pending") {
    return {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    };
  }

  if (status === "preparing") {
    return {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    };
  }

  return {
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
  };
}

export default function ProductionQueueView({ station }: Props) {
  const [data, setData] = useState<ProductionQueueResponse | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function load(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }

    try {
      setError("");

      const result = await apiGet<ProductionQueueResponse>(
        `/staff/production/${station}?include_completed=${includeCompleted}`,
      );

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load(true);

    const timer = window.setInterval(() => {
      void load(false);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [station, includeCompleted]);

  async function setStatus(
    item: ProductionQueueItem,
    status: ProductionStatus,
  ) {
    try {
      setUpdatingId(item.production_task_id);
      setError("");

      await apiPatch<ProductionQueueItem>(
        `/staff/production/tasks/${item.production_task_id}/status`,
        {
          production_status: status,
        },
      );

      await load(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update production item",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, ProductionQueueItem[]>();

    for (const item of data?.items ?? []) {
      const current = map.get(item.table_code) ?? [];
      current.push(item);
      map.set(item.table_code, current);
    }

    return [...map.entries()].sort(([left], [right]) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [data]);

  const waitingCount = (data?.items ?? []).filter(
    (item) => item.production_status === "pending",
  ).length;

  const preparingCount = (data?.items ?? []).filter(
    (item) => item.production_status === "preparing",
  ).length;

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "24px 18px 64px",
        color: "#111827",
      }}
    >
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>
            {stationLabels[station]} Queue
          </h1>

          <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
            {data
              ? `Current Session: ${data.session_name}`
              : "Current production queue"}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              padding: "9px 12px",
              borderRadius: 12,
              background: "#fff7ed",
              color: "#9a3412",
              fontWeight: 800,
              border: "1px solid #fed7aa",
            }}
          >
            Waiting {waitingCount}
          </div>

          <div
            style={{
              padding: "9px 12px",
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: 800,
              border: "1px solid #bfdbfe",
            }}
          >
            Preparing {preparingCount}
          </div>

          <button
            type="button"
            onClick={() => void load(true)}
            style={{
              minHeight: 42,
              padding: "10px 15px",
              borderRadius: 11,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#111827",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </section>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "10px 12px",
          borderRadius: 11,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          marginBottom: 20,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={includeCompleted}
          onChange={(event) => setIncludeCompleted(event.target.checked)}
        />
        Show completed items
      </label>

      {error ? (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            marginBottom: 18,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          style={{
            padding: 26,
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          Loading production queue...
        </div>
      ) : null}

      {!loading && groups.length === 0 ? (
        <div
          style={{
            padding: 34,
            textAlign: "center",
            borderRadius: 18,
            border: "1px dashed #cbd5e1",
            background: "#ffffff",
            color: "#64748b",
          }}
        >
          No {stationLabels[station].toLowerCase()} items are waiting.
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 18 }}>
        {groups.map(([tableCode, items]) => (
          <section
            key={tableCode}
            style={{
              borderRadius: 20,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
            }}
          >
            <header
              style={{
                padding: "15px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                background: "#f8fafc",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 22 }}>Table {tableCode}</h2>
              <span style={{ color: "#64748b", fontWeight: 700 }}>
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </header>

            <div style={{ display: "grid" }}>
              {items.map((item, index) => {
                const isUpdating = updatingId === item.production_task_id;
                const isBundleComponent =
                  item.parent_menu_item_name !== item.display_name;

                return (
                  <article
                    key={item.production_task_id}
                    style={{
                      padding: 18,
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1fr) minmax(220px, auto)",
                      gap: 18,
                      alignItems: "center",
                      borderTop: index === 0 ? "none" : "1px solid #eef2f7",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          marginBottom: 8,
                        }}
                      >
                        <strong style={{ fontSize: 20 }}>
                          {item.quantity} × {item.display_name}
                        </strong>

                        <span
                          style={{
                            ...statusStyle(item.production_status),
                            padding: "5px 9px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {statusLabel(item.production_status)}
                        </span>
                      </div>

                      {isBundleComponent ? (
                        <div
                          style={{
                            marginBottom: 8,
                            color: "#7c3aed",
                            fontSize: 14,
                            fontWeight: 800,
                          }}
                        >
                          From combo: {item.parent_menu_item_name}
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          color: "#64748b",
                          fontSize: 14,
                          fontWeight: 650,
                        }}
                      >
                        <span>{timeLabel(item.ordered_at)}</span>
                        <span>·</span>
                        <span>
                          {item.source === "staff"
                            ? "Staff order"
                            : "Customer QR"}
                        </span>
                      </div>

                      {item.notes ? (
                        <div
                          style={{
                            marginTop: 11,
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            color: "#92400e",
                            fontWeight: 700,
                          }}
                        >
                          Note: {item.notes}
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 9,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      {item.production_status === "pending" ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => void setStatus(item, "preparing")}
                          style={{
                            minHeight: 46,
                            padding: "11px 18px",
                            border: 0,
                            borderRadius: 12,
                            background: "#2563eb",
                            color: "#ffffff",
                            fontWeight: 900,
                            cursor: isUpdating ? "wait" : "pointer",
                            opacity: isUpdating ? 0.6 : 1,
                          }}
                        >
                          {isUpdating ? "Updating..." : "Start Preparing"}
                        </button>
                      ) : null}

                      {item.production_status === "preparing" ? (
                        <>
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => void setStatus(item, "pending")}
                            style={{
                              minHeight: 46,
                              padding: "11px 15px",
                              border: "1px solid #d1d5db",
                              borderRadius: 12,
                              background: "#ffffff",
                              color: "#374151",
                              fontWeight: 800,
                              cursor: isUpdating ? "wait" : "pointer",
                              opacity: isUpdating ? 0.6 : 1,
                            }}
                          >
                            Back to Waiting
                          </button>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => void setStatus(item, "completed")}
                            style={{
                              minHeight: 46,
                              padding: "11px 18px",
                              border: 0,
                              borderRadius: 12,
                              background: "#059669",
                              color: "#ffffff",
                              fontWeight: 900,
                              cursor: isUpdating ? "wait" : "pointer",
                              opacity: isUpdating ? 0.6 : 1,
                            }}
                          >
                            {isUpdating ? "Updating..." : "Mark Completed"}
                          </button>
                        </>
                      ) : null}

                      {item.production_status === "completed" ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => void setStatus(item, "preparing")}
                          style={{
                            minHeight: 46,
                            padding: "11px 17px",
                            border: "1px solid #d1d5db",
                            borderRadius: 12,
                            background: "#ffffff",
                            color: "#374151",
                            fontWeight: 850,
                            cursor: isUpdating ? "wait" : "pointer",
                            opacity: isUpdating ? 0.6 : 1,
                          }}
                        >
                          {isUpdating ? "Updating..." : "Reopen Item"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <style jsx>{`
        @media (max-width: 720px) {
          article {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
