"use client";
import { useTranslations } from "next-intl";
import { useTransition, useState, useRef, useCallback } from "react";
import { updateTable } from "@/lib/server/actions/admin";
import {
  adminCard,
  adminInput,
  adminLabel,
  btnPrimary,
  btnPrimaryDisabled,
  pageTitle,
  pageSubtitle,
  errorBanner,
} from "@/components/admin/adminStyles";
import type { TableRead, TableShape, TableUpdate } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DragState {
  tableId: number;
  offsetXPct: number;
  offsetYPct: number;
}

// ─── FloorPlanEditor ──────────────────────────────────────────────────────────

interface FloorPlanEditorProps {
  initialTables: TableRead[];
}

export function FloorPlanEditor({ initialTables }: FloorPlanEditorProps) {
  const t = useTranslations("admin.floorPlan");

  const [tables, setTables] = useState<TableRead[]>(initialTables);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [, startTransition] = useTransition();

  // ── Drag ─────────────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, table: TableRead) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const pxPct = ((e.clientX - rect.left) / rect.width) * 100;
      const pyPct = ((e.clientY - rect.top) / rect.height) * 100;
      dragRef.current = {
        tableId: table.id,
        offsetXPct: pxPct - table.layout_x,
        offsetYPct: pyPct - table.layout_y,
      };
      setSelectedId(table.id);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const pxPct = ((e.clientX - rect.left) / rect.width) * 100;
      const pyPct = ((e.clientY - rect.top) / rect.height) * 100;

      setTables((prev) =>
        prev.map((tbl) => {
          if (tbl.id !== drag.tableId) return tbl;
          return {
            ...tbl,
            layout_x: clamp(pxPct - drag.offsetXPct, 0, 95 - tbl.layout_width),
            layout_y: clamp(pyPct - drag.offsetYPct, 0, 95 - tbl.layout_height),
          };
        }),
      );
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const tbl = tables.find((t) => t.id === drag.tableId);
    if (tbl) void saveLayout(tbl);
  }, [tables]);

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
    setTables(initialTables);
  }, [initialTables]);

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function saveLayout(tbl: TableRead) {
    setError(null);
    setSavingId(tbl.id);
    const body: TableUpdate = {
      layout_x: Math.round(tbl.layout_x * 100) / 100,
      layout_y: Math.round(tbl.layout_y * 100) / 100,
      layout_width: tbl.layout_width,
      layout_height: tbl.layout_height,
      layout_shape: tbl.layout_shape,
    };
    startTransition(async () => {
      const result = await updateTable(tbl.id, body);
      setSavingId(null);
      if (!result.ok) {
        setError(result.error);
        setTables((prev) => prev.map((t) => (t.id === tbl.id ? tbl : t)));
        return;
      }
      setTables((prev) => prev.map((t) => (t.id === result.data.id ? result.data : t)));
      setSavedId(result.data.id);
      setTimeout(() => setSavedId((cur) => (cur === result.data.id ? null : cur)), 1500);
    });
  }

  // ── Sidebar actions ───────────────────────────────────────────────────────────

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  function patchSelected(patch: Partial<TableRead>) {
    if (!selected) return;
    setTables((prev) => prev.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)));
  }

  async function handleSaveSidebar() {
    if (!selected) return;
    await saveLayout(selected);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const activeTables = tables.filter((t) => t.is_active);

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* Header */}
      <div>
        <h1 style={pageTitle}>{t("title")}</h1>
        <p style={pageSubtitle}>{t("subtitle")}</p>
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 286px", gap: 18, alignItems: "start" }}>
        {/* Canvas — dot-grid from design spec */}
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 10",
            borderRadius: 18,
            border: "2px dashed var(--line)",
            // Dot-grid pattern from design spec (radial-gradient 22px)
            background: `radial-gradient(circle, rgba(58,42,48,0.18) 1px, transparent 1px), var(--card)`,
            backgroundSize: "22px 22px",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
            boxShadow: "0 4px 20px rgba(58,42,48,0.07)",
          }}
        >
          {activeTables.length === 0 ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-2)", fontSize: 14 }}>
              {t("noTables")}
            </div>
          ) : null}

          {activeTables.map((tbl) => {
            const isSelected = selectedId === tbl.id;
            const isSaving = savingId === tbl.id;
            const justSaved = savedId === tbl.id;

            return (
              <button
                key={tbl.id}
                type="button"
                onPointerDown={(e) => handlePointerDown(e, tbl)}
                onClick={() => setSelectedId(tbl.id)}
                aria-label={`${t("tableAriaLabel")} ${tbl.code}`}
                style={{
                  position: "absolute",
                  left: `${tbl.layout_x}%`,
                  top: `${tbl.layout_y}%`,
                  width: `${tbl.layout_width}%`,
                  height: `${tbl.layout_height}%`,
                  minWidth: "var(--tap-min)",
                  minHeight: "var(--tap-min)",
                  borderRadius: tbl.layout_shape === "round" ? "50%" : 14,
                  border: isSelected
                    ? "3px solid var(--brand)"
                    : justSaved
                      ? "2px solid var(--ready)"
                      : "2px solid var(--line)",
                  background: isSelected ? "rgba(201,72,106,0.12)" : "var(--card)",
                  boxShadow: isSelected
                    ? "0 4px 20px rgba(201,72,106,0.25)"
                    : "0 4px 14px rgba(58,42,48,0.10)",
                  color: isSelected ? "var(--brand)" : "var(--foreground)",
                  cursor: dragRef.current?.tableId === tbl.id ? "grabbing" : "grab",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 15,
                  touchAction: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                <span style={{ lineHeight: 1.2 }}>{tbl.code}</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: 10, fontWeight: 600, marginTop: 2 }}>
                  {tbl.seats}{t("seats")}
                </small>
              </button>
            );
          })}
        </div>

        {/* Sidebar — Properties panel from design spec */}
        <aside style={{
          ...adminCard,
          display: "grid",
          gap: 14,
          position: "sticky",
          top: 16,
        }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("selectedTable")}
          </h3>

          {!selected ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{t("selectHint")}</p>
          ) : (
            <>
              <strong style={{ fontSize: 24, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-num-stack)" }}>
                {selected.code}
              </strong>

              {/* Shape */}
              <div>
                <label htmlFor="fp-shape" style={adminLabel}>{t("shape")}</label>
                <select
                  id="fp-shape"
                  value={selected.layout_shape}
                  onChange={(e) => patchSelected({ layout_shape: e.target.value as TableShape })}
                  style={{ ...adminInput, paddingRight: 36 }}
                >
                  <option value="rectangle">{t("rectangle")}</option>
                  <option value="round">{t("round")}</option>
                </select>
              </div>

              {/* Width */}
              <div>
                <label htmlFor="fp-width" style={adminLabel}>
                  {t("width")}: {selected.layout_width.toFixed(0)}%
                </label>
                <input
                  id="fp-width"
                  type="range"
                  min={6}
                  max={40}
                  value={selected.layout_width}
                  onChange={(e) => patchSelected({ layout_width: Number(e.target.value) })}
                  style={{ width: "100%", minHeight: "var(--tap-min)", accentColor: "var(--brand)" }}
                />
              </div>

              {/* Height */}
              <div>
                <label htmlFor="fp-height" style={adminLabel}>
                  {t("height")}: {selected.layout_height.toFixed(0)}%
                </label>
                <input
                  id="fp-height"
                  type="range"
                  min={6}
                  max={40}
                  value={selected.layout_height}
                  onChange={(e) => patchSelected({ layout_height: Number(e.target.value) })}
                  style={{ width: "100%", minHeight: "var(--tap-min)", accentColor: "var(--brand)" }}
                />
              </div>

              {/* X/Y display */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "var(--background)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--muted-2)", fontFamily: "var(--font-num-stack)" }}>
                  X: {selected.layout_x.toFixed(1)}%
                </div>
                <div style={{ background: "var(--background)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--muted-2)", fontFamily: "var(--font-num-stack)" }}>
                  Y: {selected.layout_y.toFixed(1)}%
                </div>
              </div>

              {/* Save button */}
              <button
                type="button"
                disabled={savingId === selected.id}
                onClick={() => void handleSaveSidebar()}
                style={savingId === selected.id ? btnPrimaryDisabled : btnPrimary}
              >
                {savingId === selected.id ? t("saving") : t("saveShape")}
              </button>
            </>
          )}

          {/* Legend */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "grid", gap: 6 }}>
            <p style={{ margin: 0, fontSize: 10, color: "var(--muted-2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("legend")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(201,72,106,0.12)", border: "3px solid var(--brand)", flexShrink: 0 }} />
              <span style={{ color: "var(--muted)" }}>{t("legendSelected")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: "var(--card)", border: "2px solid var(--line)", flexShrink: 0 }} />
              <span style={{ color: "var(--muted)" }}>{t("legendActive")}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
