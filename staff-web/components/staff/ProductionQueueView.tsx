"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiGet, apiPatch } from "@/lib/api";
import {
  enableSound,
  isSoundEnabled,
  playNotificationTone,
} from "@/lib/notificationSound";
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
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: ProductionStatus) {
  if (status === "pending") return "WAITING";
  if (status === "preparing") return "PREPARING";
  return "COMPLETED";
}

export default function ProductionQueueView({
  station,
}: Props) {
  const [data, setData] =
    useState<ProductionQueueResponse | null>(null);
  const [includeCompleted, setIncludeCompleted] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] =
    useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] =
    useState(false);

  const knownPendingIds =
    useRef<Set<number> | null>(null);

  useEffect(() => {
    setSoundEnabled(isSoundEnabled());
  }, []);

  async function load(showLoading = false) {
    if (showLoading) setLoading(true);

    try {
      setError("");

      const result =
        await apiGet<ProductionQueueResponse>(
          `/staff/production/${station}` +
            `?include_completed=${includeCompleted}`,
        );

      const pending = result.items.filter(
        (item) => item.production_status === "pending",
      );

      const nextIds = new Set(
        pending.map((item) => item.production_task_id),
      );

      if (knownPendingIds.current !== null) {
        const hasNew = pending.some(
          (item) =>
            !knownPendingIds.current!.has(
              item.production_task_id,
            ),
        );

        if (hasNew) {
          playNotificationTone("new-order");
        }
      }

      knownPendingIds.current = nextIds;
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load queue",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    knownPendingIds.current = null;
    void load(true);

    const timer = window.setInterval(() => {
      void load(false);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [station, includeCompleted]);

  async function setStatus(
    item: ProductionQueueItem,
    status: ProductionStatus,
  ) {
    try {
      setUpdatingId(item.production_task_id);
      setError("");

      await apiPatch(
        `/staff/production/tasks/${item.production_task_id}/status`,
        {
          production_status: status,
        },
      );

      await load(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update item",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<
      string,
      ProductionQueueItem[]
    >();

    for (const item of data?.items ?? []) {
      const current = map.get(item.table_code) ?? [];
      current.push(item);
      map.set(item.table_code, current);
    }

    return [...map.entries()].sort(
      ([left], [right]) =>
        left.localeCompare(right, undefined, {
          numeric: true,
        }),
    );
  }, [data]);

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "24px 18px 64px",
        color: "#111827",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 34 }}>
            {stationLabels[station]} Queue
          </h1>
          <p style={{ margin: "7px 0 0", color: "#64748b" }}>
            {data
              ? `Current Session: ${data.session_name}`
              : "Current production queue"}
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            await enableSound();
            setSoundEnabled(true);
          }}
          style={{
            minHeight: 46,
            padding: "10px 16px",
            borderRadius: 12,
            border: soundEnabled
              ? "2px solid #22c55e"
              : "2px solid #94a3b8",
            background: soundEnabled
              ? "#dcfce7"
              : "#ffffff",
            color: soundEnabled ? "#166534" : "#334155",
            fontWeight: 950,
          }}
        >
          {soundEnabled ? "🔊 New-order sound on" : "🔇 Enable sound"}
        </button>
      </header>

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

      <div style={{ display: "grid", gap: 18 }}>
        {groups.map(([tableCode, items]) => (
          <section
            key={tableCode}
            style={{
              borderRadius: 20,
              border: "2px solid #cbd5e1",
              background: "#ffffff",
              overflow: "hidden",
              boxShadow: "0 12px 30px rgba(15,23,42,.09)",
            }}
          >
            <header
              style={{
                padding: "16px 19px",
                background: "#0f172a",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 25 }}>
                Table {tableCode}
              </h2>
              <strong>{items.length} item(s)</strong>
            </header>

            {items.map((item) => {
              const busy =
                updatingId === item.production_task_id;

              return (
                <article
                  key={item.production_task_id}
                  style={{
                    padding: 19,
                    borderTop: "1px solid #e5e7eb",
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0,1fr) minmax(240px,auto)",
                    gap: 18,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 22 }}>
                      {item.quantity} × {item.display_name}
                    </strong>

                    <div
                      style={{
                        marginTop: 8,
                        color: "#64748b",
                        fontWeight: 750,
                      }}
                    >
                      {timeLabel(item.ordered_at)} ·{" "}
                      {statusLabel(item.production_status)}
                    </div>

                    {item.notes ? (
                      <div
                        style={{
                          marginTop: 9,
                          padding: "9px 11px",
                          borderRadius: 10,
                          background: "#fffbeb",
                          color: "#92400e",
                          fontWeight: 800,
                        }}
                      >
                        Note: {item.notes}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    {item.production_status === "pending" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void setStatus(item, "preparing")
                        }
                        style={{
                          minWidth: 205,
                          minHeight: 58,
                          padding: "13px 20px",
                          border: "3px solid #1d4ed8",
                          borderRadius: 14,
                          background: "#2563eb",
                          color: "#ffffff",
                          fontSize: 17,
                          fontWeight: 950,
                          boxShadow:
                            "0 8px 18px rgba(37,99,235,.28)",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        ▶ START PREPARING
                      </button>
                    ) : null}

                    {item.production_status === "preparing" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void setStatus(item, "pending")
                          }
                          style={{
                            minHeight: 52,
                            padding: "12px 16px",
                            border: "2px solid #94a3b8",
                            borderRadius: 13,
                            background: "#ffffff",
                            color: "#334155",
                            fontWeight: 900,
                          }}
                        >
                          ↩ Back to Waiting
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void setStatus(item, "completed")
                          }
                          style={{
                            minWidth: 190,
                            minHeight: 58,
                            padding: "13px 20px",
                            border: "3px solid #047857",
                            borderRadius: 14,
                            background: "#059669",
                            color: "#ffffff",
                            fontSize: 17,
                            fontWeight: 950,
                            boxShadow:
                              "0 8px 18px rgba(5,150,105,.28)",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          ✓ MARK COMPLETED
                        </button>
                      </>
                    ) : null}

                    {item.production_status === "completed" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void setStatus(item, "preparing")
                        }
                        style={{
                          minHeight: 50,
                          padding: "11px 16px",
                          border: "2px solid #94a3b8",
                          borderRadius: 12,
                          background: "#f8fafc",
                          color: "#334155",
                          fontWeight: 900,
                        }}
                      >
                        Reopen Item
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
