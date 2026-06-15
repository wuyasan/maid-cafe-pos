"use client";

import { useEffect, useState } from "react";
import MaidForm from "@/components/admin/MaidForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Maid, MaidCreatePayload, MaidUpdatePayload } from "@/lib/types";

export default function AdminMaidsPage() {
  const [maids, setMaids] = useState<Maid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingMaid, setEditingMaid] = useState<Maid | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadMaids() {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet<unknown>("/maids");

      if (!Array.isArray(data)) {
        console.error("Unexpected /maids response:", data);
        throw new Error("Expected an array from /maids");
      }

      setMaids(data as Maid[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maids");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMaids();
  }, []);

  async function handleCreateMaid(payload: MaidCreatePayload) {
    await apiPost<Maid>("/maids", payload);
    await loadMaids();
  }

  async function handleUpdateMaid(maidId: number, payload: MaidUpdatePayload) {
    await apiPatch<Maid>(`/maids/${maidId}`, payload);
    setEditingMaid(null);
    await loadMaids();
  }

  async function handleToggleActive(maid: Maid) {
    try {
      setActionLoadingId(maid.id);
      await apiPatch<Maid>(`/maids/${maid.id}`, {
        is_active: !maid.is_active,
      });
      if (editingMaid?.id === maid.id) {
        setEditingMaid({
          ...editingMaid,
          is_active: !maid.is_active,
        });
      }
      await loadMaids();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle maid status");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(maid: Maid) {
    const confirmed = window.confirm(`Delete maid "${maid.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(maid.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(`/maids/${maid.id}`);
      if (editingMaid?.id === maid.id) {
        setEditingMaid(null);
      }
      await loadMaids();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete maid");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Maids</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Add, edit, activate/deactivate, and delete maid profiles.
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
        <MaidForm
          editingMaid={editingMaid}
          onCreate={handleCreateMaid}
          onUpdate={handleUpdateMaid}
          onCancelEdit={() => setEditingMaid(null)}
        />

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Maid List</h3>

          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error && maids.length === 0 ? (
            <p>No maids yet.</p>
          ) : null}

          <div style={{ display: "grid", gap: 16 }}>
            {maids.map((maid) => (
              <div
                key={maid.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 16,
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 12,
                    background: "#f3f4f6",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9ca3af",
                    fontSize: 12,
                  }}
                >
                  {maid.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={maid.photo_url}
                      alt={maid.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    "No Image"
                  )}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{maid.name}</strong>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: maid.is_active ? "#dcfce7" : "#fee2e2",
                      }}
                    >
                      {maid.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <p style={{ margin: 0, color: "#4b5563" }}>
                    {maid.bio || "No bio"}
                  </p>

                  <div style={{ fontSize: 14, color: "#6b7280" }}>
                    <div>ID: {maid.id}</div>
                    <div>Display Order: {maid.display_order}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setEditingMaid(maid)}
                      disabled={actionLoadingId === maid.id}
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
                      onClick={() => handleToggleActive(maid)}
                      disabled={actionLoadingId === maid.id}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "none",
                        background: maid.is_active ? "#f59e0b" : "#10b981",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {actionLoadingId === maid.id
                        ? "Saving..."
                        : maid.is_active
                        ? "Set Inactive"
                        : "Set Active"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(maid)}
                      disabled={actionLoadingId === maid.id}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "none",
                        background: "#dc2626",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {actionLoadingId === maid.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}