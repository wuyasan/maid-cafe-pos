"use client";

import { useEffect, useState } from "react";
import type { TableCreatePayload, TableItem, TableUpdatePayload } from "@/lib/types";

type Props = {
  editingTable: TableItem | null;
  onCreate: (payload: TableCreatePayload) => Promise<void>;
  onUpdate: (tableId: number, payload: TableUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

export default function TableForm({
  editingTable,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [code, setCode] = useState("");
  const [seats, setSeats] = useState(2);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingTable) {
      setCode(editingTable.code ?? "");
      setSeats(editingTable.seats ?? 2);
      setIsActive(editingTable.is_active);
    } else {
      setCode("");
      setSeats(2);
      setIsActive(true);
    }
  }, [editingTable]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        code,
        seats,
        is_active: isActive,
      };

      if (editingTable) {
        await onUpdate(editingTable.id, payload);
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save table");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{editingTable ? "Edit Table" : "Add Table"}</h3>
        {editingTable ? (
          <button
            type="button"
            onClick={onCancelEdit}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          placeholder="T1"
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Seats</span>
        <input
          type="number"
          min={1}
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Active</span>
      </label>

      {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "none",
          background: "#111827",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {submitting ? "Saving..." : editingTable ? "Update Table" : "Create Table"}
      </button>
    </form>
  );
}