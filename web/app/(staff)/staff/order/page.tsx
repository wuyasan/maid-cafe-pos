"use client";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useLiveQuery } from "@/lib/hooks/useLiveQuery";
import type { StaffTable, StaffTablesResult, SessionTableStatus } from "@/lib/types";
import {
  addPartyToTable,
  updateTablePartySize,
} from "@/lib/server/actions/staff";

async function fetchTables(): Promise<StaffTablesResult> {
  const res = await fetch("/api/staff/tables");
  if (!res.ok) throw new Error("tables fetch failed");
  return res.json() as Promise<StaffTablesResult>;
}

// Status badge styles matching design
const STATUS_STYLE: Record<
  SessionTableStatus,
  { bg: string; border: string; color: string; label: string }
> = {
  available: { bg: "#FBF6F3", border: "rgba(58,42,48,0.16)", color: "#B0989E", label: "空闲" },
  occupied:  { bg: "#F6EFE0", border: "#E6CF9C",             color: "#8A6B2E", label: "使用中" },
  paying:    { bg: "#FBEAEE", border: "#E0607E",             color: "#C9486A", label: "结账中" },
};

export default function StaffOrderPage() {
  const t = useTranslations("staff");
  const { data, error, isLoading, refetch } = useLiveQuery(fetchTables, {
    intervalMs: 10000,
  });

  const tables = data?.tables ?? [];

  function openOrder(tableCode: string) {
    // Reuse the customer ordering flow with source=staff.
    window.location.href = `/order/${tableCode}?source=staff`;
  }

  if (isLoading && !data) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        style={{ background: "#FBF6F3" }}
      >
        <p style={{ fontSize: 13.5, color: "var(--muted)" }}>{t("order.loading")}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
        style={{ background: "#FBF6F3" }}
      >
        <p style={{ fontSize: 13.5, color: "var(--brand)" }}>{t("order.error")}</p>
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
          {t("order.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ background: "#FBF6F3", minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      {/* ── STAFF mode banner ──────────────────────────────────── */}
      <div
        style={{
          background: "#EDEBF6",
          borderBottom: "1px solid rgba(142,134,201,0.25)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              background: "#8E86C9",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 999,
            }}
          >
            STAFF 模式
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#4A3A60" }}>
            {t("order.subtitle")}
          </span>
        </div>
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding: "20px 24px 8px" }}>
        <h1
          style={{
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: 21,
            color: "var(--foreground)",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {t("views.order")}
        </h1>
        <p style={{ fontSize: 12, color: "#A8959A", marginTop: 4 }}>
          选择桌台，进入代客点单流程
        </p>
      </div>

      {/* ── Table grid ─────────────────────────────────────────── */}
      {tables.length === 0 ? (
        <div
          style={{
            margin: "16px 24px",
            minHeight: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 18,
          }}
        >
          <p style={{ fontSize: 14, color: "#B0989E" }}>{t("order.noTables")}</p>
        </div>
      ) : (
        <ul
          style={{
            padding: "12px 24px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 12,
            listStyle: "none",
            margin: 0,
          }}
        >
          {tables.map((table) => (
            <TableButton
              key={table.id}
              table={table}
              onSelect={openOrder}
              onChanged={refetch}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TableButton({
  table,
  onSelect,
  onChanged,
}: {
  table: StaffTable;
  onSelect: (code: string) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("staff");
  const style = STATUS_STYLE[table.status];
  const [guestInput, setGuestInput] = useState("1");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = table.current_party_size ?? 0;

  function setGuests(next: number) {
    setError(null);
    const safeNext = Math.max(0, Math.min(next, table.seats));

    startTransition(async () => {
      const res = await updateTablePartySize(table.id, safeNext);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChanged();
    });
  }

  function addGuests() {
    const amount = Number.parseInt(guestInput, 10);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setError(null);
    startTransition(async () => {
      const res = await addPartyToTable(table.id, amount);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGuestInput("1");
      onChanged();
    });
  }

  return (
    <div
      style={{
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: 16,
        padding: "14px 12px",
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(table.table_code)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>{table.table_code}</div>
        <div style={{ color: style.color, fontWeight: 700 }}>
          {t(`floor.status.${table.status}`)}
        </div>
        <div style={{ marginTop: 4, fontSize: 13 }}>
          Guests: {current}/{table.seats}
        </div>
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setGuests(current - 1)}
          disabled={current <= 0}
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
          }}
        >
          −
        </button>

        <button
          type="button"
          onClick={() => setGuests(current + 1)}
          disabled={current >= table.seats}
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
          }}
        >
          +
        </button>
      </div>
      
      {error && (
        <div style={{ marginTop: 6, color: "#C9486A", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
