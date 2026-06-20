"use client";
import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "@/lib/hooks/useLiveQuery";
import { markPickedUp } from "@/lib/server/actions/staff";
import type { PickupOrder, PickupOrdersResult, PickupTask } from "@/lib/types";

async function fetchPickupOrders(): Promise<PickupOrdersResult> {
  const res = await fetch("/api/staff/production/pickup");
  if (!res.ok) throw new Error("pickup fetch failed");
  return res.json() as Promise<PickupOrdersResult>;
}

export default function RunnerPage() {
  const t = useTranslations("staff");
  const { data, error, isLoading, isStale, refetch } = useLiveQuery(fetchPickupOrders, {
    intervalMs: 2500,
  });

  const orders = data?.orders ?? [];

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" style={{ background: "#FBF6F3" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("runner.loading")}
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" style={{ background: "#FBF6F3" }}>
        {/* Stale warning banner */}
        <div
          style={{
            background: "#FAEFDD",
            borderRadius: 14,
            padding: "13px 17px",
            color: "#A87E2E",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: 520,
            width: "100%",
            margin: "0 16px",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A87E2E"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 17, height: 17, flexShrink: 0 }}
          >
            <path d="M10.3 4.3 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {t("runner.error")}
        </div>
        <button
          type="button"
          onClick={refetch}
          style={{
            background: "var(--brand)",
            color: "#fff",
            borderRadius: 12,
            padding: "11px 22px",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
            minHeight: "var(--tap-min)",
          }}
        >
          {t("runner.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 p-4 md:p-6"
      style={{ background: "#FBF6F3", minHeight: "100vh" }}
    >
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display-stack)",
              fontWeight: 700,
              fontSize: 21,
              color: "var(--foreground)",
              lineHeight: 1.2,
            }}
          >
            {t("views.runner")}
          </h1>
          {data?.session_name && (
            <p style={{ fontSize: 12, color: "#A8959A", marginTop: 2 }}>
              {data.session_name}
            </p>
          )}
        </div>

        {/* Live / stale pill */}
        <span
          style={{
            background: isStale ? "#FAEFDD" : "#E6F1EA",
            color: isStale ? "#A87E2E" : "#3F8763",
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 14px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: isStale ? "#D69A4E" : "#7BAE8E",
              display: "inline-block",
              flexShrink: 0,
              animation: isStale ? "none" : "liveDot 1.4s infinite",
            }}
          />
          {isStale ? t("runner.stale") : `${t("runner.live")} · 齐单声音提醒`}
        </span>
      </div>

      {/* Stale warning banner (when data is stale but still showing) */}
      {isStale && orders.length > 0 && (
        <div
          style={{
            background: "#FAEFDD",
            borderRadius: 14,
            padding: "13px 17px",
            color: "#A87E2E",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A87E2E"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 17, height: 17, flexShrink: 0 }}
          >
            <path d="M10.3 4.3 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {t("runner.stale")} · 显示最后一次数据，仍可手动操作
        </div>
      )}

      {/* ── Orders grid ─────────────────────────────── */}
      {orders.length === 0 ? (
        <div
          className="flex min-h-[200px] items-center justify-center"
          style={{
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 18,
          }}
        >
          <p style={{ fontSize: 14, color: "#B0989E" }}>{t("runner.empty")}</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {orders.map((order) => (
            <PickupOrderCard key={order.order_id} order={order} onRefetch={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pickup order card ────────────────────────────────────────────────────────

function PickupOrderCard({
  order,
  onRefetch,
}: {
  order: PickupOrder;
  onRefetch: () => void;
}) {
  const t = useTranslations("staff");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  function handlePickup() {
    if (!order.all_completed || isPending) return;
    setActionError(null);
    startTransition(async () => {
      const result = await markPickedUp(order.order_id);
      if (!result.ok) setActionError(t("action.actionFailed"));
      onRefetch();
    });
  }

  // Build a compact item list string for the card subtitle
  const itemSummary = order.tasks
    .map((tk) => `${tk.display_name} ×${tk.quantity}`)
    .join(" · ");

  return (
    <div
      style={{
        background: "#fff",
        border: order.all_completed
          ? "1.5px solid rgba(123,174,142,0.45)"
          : "1.5px solid rgba(58,42,48,0.07)",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 12px 28px -18px rgba(58,42,48,0.4)",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Header: table code + all-done badge */}
      <div className="flex items-center justify-between">
        <span
          style={{
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: 24,
            color: "#3A2A30",
            lineHeight: 1.1,
          }}
        >
          送 {order.table_code}
        </span>
        {order.all_completed ? (
          <span
            style={{
              background: "#7BAE8E",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 11px",
              borderRadius: 999,
            }}
          >
            全齐
          </span>
        ) : (
          <span
            style={{
              background: "#FAEFDD",
              color: "#A87E2E",
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 11px",
              borderRadius: 999,
            }}
          >
            {t("runner.waiting", { count: order.waiting_count })}
          </span>
        )}
      </div>

      {/* Item list */}
      <div style={{ fontSize: 13, color: "#7E6A70", marginTop: 8, lineHeight: 1.4 }}>
        {itemSummary}
      </div>

      {/* Task rows (per station) */}
      <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {order.tasks.map((task) => (
          <TaskRow key={task.production_task_id} task={task} />
        ))}
      </ul>

      {/* Error */}
      {actionError && (
        <p style={{ fontSize: 11, color: "var(--brand)", marginTop: 6 }}>{actionError}</p>
      )}

      {/* Pick-up button */}
      <button
        type="button"
        onClick={handlePickup}
        disabled={!order.all_completed || isPending}
        style={{
          width: "100%",
          borderRadius: 12,
          padding: "13px 0",
          fontWeight: 700,
          fontSize: 14.5,
          marginTop: 14,
          border: order.all_completed ? "none" : "1.5px solid rgba(58,42,48,0.14)",
          background: order.all_completed ? "#7BAE8E" : "transparent",
          color: order.all_completed ? "#fff" : "#A8959A",
          cursor: order.all_completed && !isPending ? "pointer" : "not-allowed",
          minHeight: "var(--tap-min)",
          transition: "opacity 0.15s",
          textAlign: "center",
        }}
      >
        {isPending
          ? t("runner.processing")
          : order.all_completed
            ? `标记已取 Picked up`
            : `未齐·等待出品`}
      </button>
    </div>
  );
}

// ── Task row ────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: PickupTask }) {
  const statusColor: Record<string, string> = {
    pending: "#9A8388",
    preparing: "#D69A4E",
    completed: "#7BAE8E",
  };
  const statusIcon: Record<string, string> = {
    pending: "·",
    preparing: "⟳",
    completed: "✓",
  };

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12.5,
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span
          style={{
            background:
              task.station === "kitchen"
                ? "rgba(214,154,78,0.12)"
                : "rgba(142,134,201,0.12)",
            color:
              task.station === "kitchen" ? "var(--cooking)" : "var(--maid)",
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {task.station}
        </span>
        <span
          style={{
            color: "var(--foreground)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {task.display_name} ×{task.quantity}
        </span>
      </div>
      <span
        style={{
          color: statusColor[task.production_status] ?? "#9A8388",
          fontWeight: 600,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {statusIcon[task.production_status] ?? "·"}{" "}
        {task.production_status}
      </span>
    </li>
  );
}
