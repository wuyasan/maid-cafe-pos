"use client";

import { useEffect, useState } from "react";
import TableForm from "@/components/admin/TableForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { TableCreatePayload, TableItem, TableUpdatePayload } from "@/lib/types";

export default function AdminTablesPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingTable, setEditingTable] = useState<TableItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadTables() {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet<unknown>("/tables");

      if (!Array.isArray(data)) {
        console.error("Unexpected /tables response:", data);
        throw new Error("Expected an array from /tables");
      }

      setTables(data as TableItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, []);

  async function handleCreateTable(payload: TableCreatePayload) {
    await apiPost<TableItem>("/tables", payload);
    await loadTables();
  }

  async function handleUpdateTable(tableId: number, payload: TableUpdatePayload) {
    await apiPatch<TableItem>(`/tables/${tableId}`, payload);
    setEditingTable(null);
    await loadTables();
  }

  async function handleToggleActive(table: TableItem) {
    try {
      setActionLoadingId(table.id);
      await apiPatch<TableItem>(`/tables/${table.id}`, {
        is_active: !table.is_active,
      });
      if (editingTable?.id === table.id) {
        setEditingTable({
          ...editingTable,
          is_active: !table.is_active,
        });
      }
      await loadTables();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle table status");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(table: TableItem) {
    const confirmed = window.confirm(`Delete table "${table.code}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(table.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(`/tables/${table.id}`);
      if (editingTable?.id === table.id) {
        setEditingTable(null);
      }
      await loadTables();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete table");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Tables</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Add, edit, activate/deactivate, and delete table records.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <TableForm
          editingTable={editingTable}
          onCreate={handleCreateTable}
          onUpdate={handleUpdateTable}
          onCancelEdit={() => setEditingTable(null)}
        />

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Table List</h3>

          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error && tables.length === 0 ? <p>No tables yet.</p> : null}

          <div style={{ display: "grid", gap: 16 }}>
            {tables.map((table) => (
              <div
                key={table.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{table.code}</strong>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: table.is_active ? "#dcfce7" : "#fee2e2",
                    }}
                  >
                    {table.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div style={{ fontSize: 14, color: "#4b5563" }}>
                  <div>ID: {table.id}</div>
                  <div>Seats: {table.seats}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setEditingTable(table)}
                    disabled={actionLoadingId === table.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleActive(table)}
                    disabled={actionLoadingId === table.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: table.is_active ? "#f59e0b" : "#10b981",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === table.id
                      ? "Saving..."
                      : table.is_active
                      ? "Set Inactive"
                      : "Set Active"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(table)}
                    disabled={actionLoadingId === table.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === table.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}