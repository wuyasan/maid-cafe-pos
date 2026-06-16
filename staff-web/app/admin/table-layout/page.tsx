"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";

import { apiGet, apiPatch } from "@/lib/api";
import type { TableItem } from "@/lib/types";

type DragState = {
  tableId: number;
  offsetX: number;
  offsetY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function TableLayoutPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setError("");
      setTables(await apiGet<TableItem[]>("/tables"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startDrag(
    event: PointerEvent<HTMLButtonElement>,
    table: TableItem,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    setSelectedId(table.id);
    setDrag({
      tableId: table.id,
      offsetX: pointerX - table.layout_x,
      offsetY: pointerY - table.layout_y,
    });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    setTables((current) =>
      current.map((table) => {
        if (table.id !== drag.tableId) return table;

        return {
          ...table,
          layout_x: clamp(
            pointerX - drag.offsetX,
            0,
            100 - table.layout_width,
          ),
          layout_y: clamp(
            pointerY - drag.offsetY,
            0,
            100 - table.layout_height,
          ),
        };
      }),
    );
  }

  async function finishDrag() {
    if (!drag) return;

    const table = tables.find((item) => item.id === drag.tableId);
    setDrag(null);
    if (!table) return;

    await saveTable(table);
  }

  async function saveTable(table: TableItem) {
    try {
      setSavingId(table.id);
      setError("");

      const updated = await apiPatch<TableItem>(`/tables/${table.id}`, {
        layout_x: Number(table.layout_x.toFixed(2)),
        layout_y: Number(table.layout_y.toFixed(2)),
        layout_width: table.layout_width,
        layout_height: table.layout_height,
        layout_shape: table.layout_shape,
      });

      setTables((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save layout");
      await load();
    } finally {
      setSavingId(null);
    }
  }

  const selected = tables.find((table) => table.id === selectedId) ?? null;

  function updateSelected(patch: Partial<TableItem>) {
    if (!selected) return;

    setTables((current) =>
      current.map((table) =>
        table.id === selected.id ? { ...table, ...patch } : table,
      ),
    );
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div>
        <h1 style={{ marginBottom: 7 }}>Table Layout</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Drag tables to match the venue. Select a table to change its size or
          shape.
        </p>
      </div>

      {error ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div
          ref={canvasRef}
          onPointerMove={moveDrag}
          onPointerUp={() => void finishDrag()}
          onPointerCancel={() => setDrag(null)}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 10",
            minHeight: 470,
            borderRadius: 20,
            border: "2px dashed #cbd5e1",
            background:
              "linear-gradient(#f8fafc 1px, transparent 1px), linear-gradient(90deg, #f8fafc 1px, transparent 1px), #ffffff",
            backgroundSize: "5% 5%",
            overflow: "hidden",
            touchAction: "none",
          }}
        >
          {tables
            .filter((table) => table.is_active)
            .map((table) => (
              <button
                key={table.id}
                type="button"
                onPointerDown={(event) => startDrag(event, table)}
                onClick={() => setSelectedId(table.id)}
                style={{
                  position: "absolute",
                  left: `${table.layout_x}%`,
                  top: `${table.layout_y}%`,
                  width: `${table.layout_width}%`,
                  height: `${table.layout_height}%`,
                  borderRadius:
                    table.layout_shape === "round" ? "50%" : 16,
                  border:
                    selectedId === table.id
                      ? "3px solid #7c3aed"
                      : "2px solid #94a3b8",
                  background: "#ffffff",
                  color: "#111827",
                  boxShadow: "0 8px 20px rgba(15,23,42,.12)",
                  cursor: drag?.tableId === table.id ? "grabbing" : "grab",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                  fontSize: 18,
                  touchAction: "none",
                }}
              >
                <span>
                  {table.code}
                  <small
                    style={{
                      display: "block",
                      color: "#64748b",
                      fontSize: 11,
                      marginTop: 3,
                    }}
                  >
                    {table.seats} seats
                  </small>
                </span>
              </button>
            ))}
        </div>

        <aside
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 16,
            display: "grid",
            gap: 14,
          }}
        >
          <h3 style={{ margin: 0 }}>Selected Table</h3>

          {!selected ? (
            <p style={{ margin: 0, color: "#64748b" }}>
              Select a table on the map.
            </p>
          ) : (
            <>
              <strong style={{ fontSize: 22 }}>{selected.code}</strong>

              <label style={{ display: "grid", gap: 5 }}>
                <span>Shape</span>
                <select
                  value={selected.layout_shape}
                  onChange={(event) =>
                    updateSelected({
                      layout_shape: event.target.value as "rectangle" | "round",
                    })
                  }
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="round">Round</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 5 }}>
                <span>Width: {selected.layout_width.toFixed(0)}%</span>
                <input
                  type="range"
                  min={6}
                  max={40}
                  value={selected.layout_width}
                  onChange={(event) =>
                    updateSelected({
                      layout_width: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label style={{ display: "grid", gap: 5 }}>
                <span>Height: {selected.layout_height.toFixed(0)}%</span>
                <input
                  type="range"
                  min={6}
                  max={40}
                  value={selected.layout_height}
                  onChange={(event) =>
                    updateSelected({
                      layout_height: Number(event.target.value),
                    })
                  }
                />
              </label>

              <button
                type="button"
                disabled={savingId === selected.id}
                onClick={() => void saveTable(selected)}
                style={{
                  minHeight: 44,
                  border: 0,
                  borderRadius: 11,
                  background: "#7c3aed",
                  color: "#ffffff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {savingId === selected.id ? "Saving..." : "Save Size & Shape"}
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
