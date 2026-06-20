"use client";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "@/lib/hooks/useLiveQuery";
import { setProductionStatus } from "@/lib/server/actions/staff";
import type { ProductionQueueItem, ProductionQueueResult, ProductionStatus, ProductionStation } from "@/lib/types";

// ── Status order & design-spec values ─────────────────────────────────────────
const STATUS_ORDER: ProductionStatus[] = ["pending", "preparing", "completed"];

// Column header text colors (dark bg)
const COLUMN_LABEL_COLOR: Record<ProductionStatus, string> = {
  pending: "#E6B36A",    // amber label for to-do column
  preparing: "#E0A0B4",  // soft pink for cooking column
  completed: "#8FCBA8",  // green for done column
};

// Column bg (dark card)
const COLUMN_BG = "rgba(255,255,255,0.04)";

// Card border accent (left border on task cards)
const CARD_ACCENT: Record<ProductionStatus, string> = {
  pending: "#E0607E",
  preparing: "#E6B36A",
  completed: "transparent",
};

// Action button styles per next status
const ACTION_BTN_STYLE: Record<string, { background: string; color: string }> = {
  start:     { background: "#E0607E", color: "#fff" },                  // pending → preparing (fresh = rose)
  startIdle: { background: "rgba(255,255,255,0.10)", color: "#F1E9E6" }, // pending → preparing (older = glass)
  done:      { background: "#7BAE8E", color: "#15291F" },               // preparing → completed
  revert:    { background: "rgba(255,255,255,0.10)", color: "rgba(241,233,230,0.8)" },
};

// Next / prev status transitions
const NEXT_STATUS: Record<ProductionStatus, ProductionStatus | null> = {
  pending: "preparing",
  preparing: "completed",
  completed: null,
};
const PREV_STATUS: Record<ProductionStatus, ProductionStatus | null> = {
  pending: null,
  preparing: "pending",
  completed: "preparing",
};

interface Props {
  station: ProductionStation;
}

export function ProductionQueueView({ station }: Props) {
  const t = useTranslations("staff");
  const [mountedAt] = useState(() => new Date().getTime());

  const fetcher = useCallback(
    () =>
      fetch(`/api/staff/production/queue?station=${station}`).then((r) => {
        if (!r.ok) throw new Error("queue fetch failed");
        return r.json() as Promise<ProductionQueueResult>;
      }),
    [station],
  );

  const { data, error, isLoading, isStale, refetch } = useLiveQuery(fetcher, {
    intervalMs: 2500,
  });

  const items = data?.items ?? [];

  // Group items by production_status
  const grouped: Record<ProductionStatus, ProductionQueueItem[]> = {
    pending: [],
    preparing: [],
    completed: [],
  };
  for (const item of items) {
    grouped[item.production_status].push(item);
  }

  if (isLoading && !data) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        style={{ background: "#1C1418" }}
      >
        <p style={{ fontSize: 14, color: "#8A7873" }}>{t("queue.loading")}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
        style={{ background: "#1C1418" }}
      >
        <p style={{ fontSize: 14, color: "#E0607E" }}>{t("queue.error")}</p>
        <button
          type="button"
          onClick={refetch}
          style={{
            background: "#C9486A",
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
          {t("queue.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ background: "#1C1418", minHeight: "100vh", color: "#F1E9E6" }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "20px 26px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: 20,
            color: "#F1E9E6",
          }}
        >
          {t(`views.${station}`)}
        </div>
        <div className="flex items-center gap-4">
          {/* Live / stale indicator */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
              color: isStale ? "#D69A4E" : "#8FCBA8",
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
                animation: isStale ? "none" : "liveDot 1.4s infinite",
              }}
            />
            {isStale ? t("queue.stale") : t("queue.live")}
          </span>
        </div>
      </div>

      {/* ── Queue grid ─────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center"
          style={{ padding: 40 }}
        >
          <p style={{ fontSize: 14, color: "#6A5A56" }}>{t("queue.empty")}</p>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            padding: 20,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {STATUS_ORDER.map((status) => (
            <StatusColumn
              key={status}
              status={status}
              items={grouped[status]}
              mountedAt={mountedAt}
              onRefetch={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status column ────────────────────────────────────────────────────────────

function StatusColumn({
  status,
  items,
  mountedAt,
  onRefetch,
}: {
  status: ProductionStatus;
  items: ProductionQueueItem[];
  mountedAt: number;
  onRefetch: () => void;
}) {
  const t = useTranslations("staff");

  const columnLabel: Record<ProductionStatus, string> = {
    pending: "action.pending",
    preparing: "action.preparing",
    completed: "action.completed",
  };

  const columnSubLabel: Record<ProductionStatus, { en: string; zh: string }> = {
    pending:   { en: "To-do", zh: "待做" },
    preparing: { en: "Cooking", zh: "制作中" },
    completed: { en: "Done", zh: "完成" },
  };
  void columnSubLabel; // used via t() below

  // Badge bg colors matching design
  const badgeBg: Record<ProductionStatus, string> = {
    pending:   "rgba(214,154,78,0.2)",
    preparing: "rgba(224,96,126,0.2)",
    completed: "rgba(123,174,142,0.2)",
  };

  return (
    <div
      style={{
        background: COLUMN_BG,
        borderRadius: 18,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 13,
      }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2" style={{ paddingBottom: 2 }}>
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: COLUMN_LABEL_COLOR[status],
          }}
        >
          {t(columnLabel[status])}
        </span>
        <span
          style={{
            fontFamily: "var(--font-num-stack)",
            fontWeight: 700,
            fontSize: 12,
            background: badgeBg[status],
            color: COLUMN_LABEL_COLOR[status],
            padding: "1px 9px",
            borderRadius: 999,
          }}
        >
          {items.length}
        </span>
      </div>

      {/* Task cards */}
      {items.map((item) => (
        <TaskCard
          key={item.production_task_id}
          item={item}
          mountedAt={mountedAt}
          onRefetch={onRefetch}
        />
      ))}
    </div>
  );
}

// ── Task card ────────────────────────────────────────────────────────────────

const HIGHLIGHT_TTL_MS = 8000;

function TaskCard({
  item,
  mountedAt,
  onRefetch,
}: {
  item: ProductionQueueItem;
  mountedAt: number;
  onRefetch: () => void;
}) {
  const t = useTranslations("staff");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const isNew =
    item.production_status === "pending" &&
    mountedAt - new Date(item.ordered_at).getTime() < HIGHLIGHT_TTL_MS;

  const nextStatus = NEXT_STATUS[item.production_status];
  const prevStatus = PREV_STATUS[item.production_status];
  const isCompleted = item.production_status === "completed";

  function handleAdvance() {
    if (!nextStatus || isPending) return;
    setActionError(null);
    startTransition(async () => {
      const result = await setProductionStatus(item.production_task_id, nextStatus);
      if (!result.ok) setActionError(t("action.actionFailed"));
      onRefetch();
    });
  }

  function handleRevert() {
    if (!prevStatus || isPending) return;
    setActionError(null);
    startTransition(async () => {
      const result = await setProductionStatus(item.production_task_id, prevStatus);
      if (!result.ok) setActionError(t("action.actionFailed"));
      onRefetch();
    });
  }

  // Design: completed cards are dimmed + green-tinted bg
  const cardBg = isCompleted ? "rgba(123,174,142,0.1)" : "#2A1F24";
  const cardOpacity = isPending ? 0.5 : isCompleted ? 0.7 : 1;
  const borderLeft = !isCompleted && CARD_ACCENT[item.production_status] !== "transparent"
    ? `4px solid ${CARD_ACCENT[item.production_status]}`
    : undefined;
  const boxShadow =
    isNew ? `0 0 0 1px rgba(224,96,126,0.25)` : undefined;

  return (
    <div
      style={{
        background: cardBg,
        borderRadius: 14,
        padding: 15,
        borderLeft,
        boxShadow,
        opacity: cardOpacity,
        transition: "opacity 0.15s",
      }}
    >
      {/* Table code + time */}
      <div className="flex items-center justify-between">
        <span
          style={{
            fontFamily: "var(--font-num-stack)",
            fontWeight: 700,
            fontSize: isCompleted ? 19 : 22,
            color: "#F1E9E6",
            lineHeight: 1,
          }}
        >
          {item.table_code}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isNew ? "#E0607E" : isCompleted ? "#8FCBA8" : "#9A8388",
          }}
        >
          {isNew
            ? `${t("queue.new")} · 刚刚`
            : isCompleted
              ? `✓ ${t("action.completed")}`
              : ""}
        </span>
      </div>

      {/* Item name + qty */}
      <div
        style={{
          fontSize: isCompleted ? 16 : 18,
          fontWeight: 600,
          marginTop: 8,
          color: "#F1E9E6",
          lineHeight: 1.3,
        }}
      >
        {item.display_name}
        {" "}
        <span
          style={{
            fontFamily: "var(--font-num-stack)",
            fontWeight: 700,
            color: isCompleted ? "#8FCBA8" : "#F1E9E6",
          }}
        >
          ×{item.quantity}
        </span>
      </div>

      {/* Notes */}
      {item.notes && (
        <div
          style={{
            fontSize: 12.5,
            color: "#D6A77E",
            marginTop: 6,
          }}
        >
          📝 {item.notes}
        </div>
      )}

      {/* Error */}
      {actionError && (
        <p style={{ fontSize: 11, color: "#E0607E", marginTop: 4 }}>{actionError}</p>
      )}

      {/* Action buttons — not shown for completed */}
      {!isCompleted && (
        <div style={{ marginTop: 13, display: "flex", gap: 8 }}>
          {prevStatus && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={isPending}
              aria-label={t("queue.revertTo", { status: prevStatus })}
              style={{
                flex: 1,
                borderRadius: 11,
                padding: "12px 0",
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
                minHeight: "var(--tap-min)",
                ...ACTION_BTN_STYLE.revert,
                transition: "opacity 0.15s",
              }}
            >
              ← {t(`action.${prevStatus}`)}
            </button>
          )}
          {nextStatus && (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={isPending}
              aria-label={t("queue.advanceTo", { status: nextStatus })}
              style={{
                flex: prevStatus ? 1.5 : 1,
                borderRadius: 11,
                padding: "13px 0",
                fontWeight: 700,
                fontSize: 15,
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
                minHeight: "var(--tap-min)",
                ...(nextStatus === "preparing"
                  ? (isNew ? ACTION_BTN_STYLE.start : ACTION_BTN_STYLE.startIdle)
                  : ACTION_BTN_STYLE.done),
                transition: "opacity 0.15s",
              }}
            >
              {nextStatus === "preparing"
                ? `开始制作 Start`
                : `✓ 标完成 Done`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
