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

  async function setStatus(item: ProductionQueueItem, status: ProductionStatus) {
    try {
      setUpdatingId(item.order_item_id);
      setError("");
      await apiPatch(`/staff/production/items/${item.order_item_id}/status`, {
        production_status: status,
      });
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
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{stationLabels[station]} Queue</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            {data ? `Current Session: ${data.session_name}` : "Current production queue"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(event) => setIncludeCompleted(event.target.checked)}
            />
            Show completed
          </label>
          <button type="button" onClick={() => load(true)} style={{ padding: "10px 14px", borderRadius: 10 }}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 12 }}>{error}</div> : null}
      {loading ? <p>Loading...</p> : null}
      {!loading && groups.length === 0 ? (
        <div style={{ padding: 24, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16 }}>
          No {stationLabels[station].toLowerCase()} items are waiting.
        </div>
      ) : null}

      {groups.map(([tableCode, items]) => (
        <section key={tableCode} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Table {tableCode}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => (
              <article key={item.order_item_id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 18 }}>{item.quantity} × {item.menu_item_name}</strong>
                  <span>{timeLabel(item.ordered_at)}</span>
                </div>
                <div style={{ color: "#6b7280" }}>
                  {item.source === "staff" ? "Staff order" : "Customer QR"} · {statusLabel(item.production_status)}
                </div>
                {item.notes ? <div style={{ padding: 10, background: "#fef3c7", borderRadius: 10 }}><strong>Note:</strong> {item.notes}</div> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button disabled={updatingId === item.order_item_id || item.production_status === "pending"} onClick={() => setStatus(item, "pending")}>Pending</button>
                  <button disabled={updatingId === item.order_item_id || item.production_status === "preparing"} onClick={() => setStatus(item, "preparing")}>Start</button>
                  <button disabled={updatingId === item.order_item_id || item.production_status === "completed"} onClick={() => setStatus(item, "completed")}>Complete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
