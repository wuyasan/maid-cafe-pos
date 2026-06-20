"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "@/lib/hooks/useLiveQuery";
import { formatUSD } from "@/lib/money";
import type { StaffTable, SessionTableStatus } from "@/lib/types";

// ── Status styles matching design spec ─────────────────────────────────────
const STATUS_STYLE: Record<
  SessionTableStatus,
  { bg: string; border: string; borderStyle: string; nameColor: string }
> = {
  available: {
    bg: "#FBF6F3",
    border: "rgba(58,42,48,0.16)",
    borderStyle: "dashed",
    nameColor: "#B0989E",
  },
  occupied: {
    bg: "#F6EFE0",
    border: "#E6CF9C",
    borderStyle: "solid",
    nameColor: "#8A6B2E",
  },
  paying: {
    bg: "#FBEAEE",
    border: "#E0607E",
    borderStyle: "solid",
    nameColor: "#C9486A",
  },
};

// Keep fetcher stable outside render so useLiveQuery doesn't re-subscribe on every render.
async function fetchTables() {
  const res = await fetch("/api/staff/tables");
  if (!res.ok) throw new Error("tables fetch failed");
  return res.json() as Promise<{ session_id: number; session_name: string; tables: StaffTable[] }>;
}

export default function FloorPage() {
  const t = useTranslations("staff");
  const router = useRouter();
  const { data, error, isLoading, isStale, refetch } = useLiveQuery(fetchTables, {
    intervalMs: 10000,
  });

  const tables = data?.tables ?? [];

  // Compute subtitle stats
  const occupiedCount = tables.filter((t) => t.status === "occupied").length;
  const payingCount = tables.filter((t) => t.status === "paying").length;

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("floor.loading")}
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm" style={{ color: "var(--brand)" }}>
          {t("floor.error")}
        </p>
        <button
          type="button"
          onClick={refetch}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--brand)", minHeight: "var(--tap-min)" }}
        >
          {t("floor.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes liveDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
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
              {t("views.floor")}
            </h1>
            {tables.length > 0 && (
              <p
                className="mt-0.5"
                style={{ fontSize: 12, color: "#A8959A", lineHeight: 1.4 }}
              >
                {/* "{n}桌在用·{m}桌结账中" */}
                {t("floor.occupied_count", { count: occupiedCount })}
                {"·"}
                {t("floor.paying_count", { count: payingCount })}
              </p>
            )}
          </div>

          {/* Live / stale pill */}
          {isStale ? (
            <span
              style={{
                background: "#FEF3CD",
                color: "#92680A",
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 12px",
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
                  background: "#D69A4E",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {t("floor.stale")}
            </span>
          ) : (
            <span
              style={{
                background: "#E6F1EA",
                color: "#3F8763",
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
                  background: "#7BAE8E",
                  display: "inline-block",
                  flexShrink: 0,
                  animation: "liveDot 2s ease-in-out infinite",
                }}
              />
              {t("floor.live")}
            </span>
          )}
        </div>

        {/* ── Legend ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-3" style={{ fontSize: 12, fontWeight: 500 }}>
          {(["available", "occupied", "paying"] as SessionTableStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: STATUS_STYLE[s].bg,
                  border: `1.5px ${STATUS_STYLE[s].borderStyle} ${STATUS_STYLE[s].border}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: STATUS_STYLE[s].nameColor }}>
                {t(`floor.status.${s}`)}
              </span>
            </span>
          ))}
        </div>

        {/* ── Floor plan ─────────────────────────────── */}
        {tables.length === 0 ? (
          <div
            className="flex min-h-[300px] items-center justify-center"
            style={{
              background: "#fff",
              border: "1px solid rgba(58,42,48,0.06)",
              borderRadius: 18,
            }}
          >
            <p className="text-sm" style={{ color: "#B0989E" }}>
              {t("floor.empty")}
            </p>
          </div>
        ) : (
          <div
            className="relative w-full overflow-hidden"
            style={{
              background: "#fff",
              border: "1px solid rgba(58,42,48,0.06)",
              borderRadius: 18,
              paddingBottom: "75%",
            }}
          >
            <div className="absolute inset-0">
              {tables.map((table) => (
                <TableTile
                  key={table.id}
                  table={table}
                  onClick={() => router.push(`/staff/table/${table.table_code}`)}
                />
              ))}
            </div>
            {/* Bottom-right hint */}
            <span
              style={{
                position: "absolute",
                bottom: 12,
                right: 14,
                fontSize: 11,
                color: "#C2ADB3",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {t("floor.layoutHint")}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function TableTile({
  table,
  onClick,
}: {
  table: StaffTable;
  onClick: () => void;
}) {
  const t = useTranslations("staff");
  const style = STATUS_STYLE[table.status];
  const isRound = table.layout_shape === "round";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t("floor.tableAriaLabel")} ${table.table_code} – ${t(`floor.status.${table.status}`)}`}
      style={{
        position: "absolute",
        left: `${table.layout_x}%`,
        top: `${table.layout_y}%`,
        width: `${table.layout_width}%`,
        height: `${table.layout_height}%`,
        minWidth: "var(--tap-min)",
        minHeight: "var(--tap-min)",
        background: style.bg,
        border: `1.5px ${style.borderStyle} ${style.border}`,
        borderRadius: isRound ? "50%" : 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px",
        cursor: "pointer",
        transition: "opacity 0.15s, box-shadow 0.15s",
      }}
    >
      {/* Table code — Space Grotesk fw700 17px */}
      <span
        style={{
          fontFamily: "var(--font-mono, 'Space Grotesk', monospace)",
          fontWeight: 700,
          fontSize: 17,
          color: style.nameColor,
          lineHeight: 1.1,
        }}
      >
        {table.table_code}
      </span>
      {/* Party size */}
      {table.current_party_size > 0 && (
        <span
          style={{
            fontSize: 11,
            color: style.nameColor,
            opacity: 0.75,
            lineHeight: 1.3,
            marginTop: 1,
          }}
        >
          ×{table.current_party_size}
        </span>
      )}
      {/* Open bill total */}
      {table.open_bill_id !== null && Number(table.open_bill_total) > 0 && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: style.nameColor,
            opacity: 0.85,
            lineHeight: 1.3,
          }}
        >
          {formatUSD(table.open_bill_total)}
        </span>
      )}
    </button>
  );
}
