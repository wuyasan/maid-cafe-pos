"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import type {
  ProductionQueueItem,
  ProductionQueueResponse,
  ProductionStation,
  ProductionStatus,
} from "@/lib/productionTypes";

type Props = { station: ProductionStation };

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
  if (status === "pending") return "Pending";
  if (status === "preparing") return "Preparing";
  return "Completed";
}

export default function ProductionQueueView({ station }: Props) {
  const [data, setData] = useState<ProductionQueueResponse | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function load(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      setError("");
      const result = await apiGet<ProductionQueueResponse>(
        `/staff/production/${station}?include_completed=${includeCompleted}`,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 5000);
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
        { production_status: status },
      );
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
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
    return [...map.entries()];
  }, [data]);

  return (
    <main style={{ padding: 24, display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{stationLabels[station]} Queue</h1>
          <p style={{ color: "#6b7280" }}>
            {data ? `Current Session: ${data.session_name}` : "Current production queue"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(event) => setIncludeCompleted(event.target.checked)}
            />
            Show completed
          </label>
          <button onClick={() => load(true)} style={{ padding: "10px 14px", borderRadius: 10 }}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {loading ? <p>Loading...</p> : null}
      {!loading && groups.length === 0 ? (
        <p>No {stationLabels[station].toLowerCase()} items are waiting.</p>
      ) : null}

      {groups.map(([tableCode, items]) => (
        <section key={tableCode} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Table {tableCode}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => {
              const isBundleComponent = item.parent_menu_item_name !== item.display_name;
              return (
                <article key={item.production_task_id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{item.quantity} × {item.display_name}</strong>
                      {isBundleComponent ? (
                        <div style={{ color: "#7c3aed", fontSize: 13, marginTop: 4 }}>
                          From combo: {item.parent_menu_item_name}
                        </div>
                      ) : null}
                    </div>
                    <span>{timeLabel(item.ordered_at)}</span>
                  </div>
                  <p style={{ color: "#6b7280", marginBottom: 8 }}>
                    {item.source === "staff" ? "Staff order" : "Customer QR"} · {statusLabel(item.production_status)}
                  </p>
                  {item.notes ? <p><strong>Note:</strong> {item.notes}</p> : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={updatingId === item.production_task_id} onClick={() => setStatus(item, "pending")}>Pending</button>
                    <button disabled={updatingId === item.production_task_id} onClick={() => setStatus(item, "preparing")}>Start</button>
                    <button disabled={updatingId === item.production_task_id} onClick={() => setStatus(item, "completed")}>Complete</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
