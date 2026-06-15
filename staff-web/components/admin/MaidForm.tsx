"use client";

import { useEffect, useState } from "react";
import type { Maid, MaidCreatePayload, MaidUpdatePayload } from "@/lib/types";

type Props = {
  editingMaid: Maid | null;
  onCreate: (payload: MaidCreatePayload) => Promise<void>;
  onUpdate: (maidId: number, payload: MaidUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

export default function MaidForm({
  editingMaid,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [bio, setBio] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingMaid) {
      setName(editingMaid.name ?? "");
      setPhotoUrl(editingMaid.photo_url ?? "");
      setBio(editingMaid.bio ?? "");
      setIsActive(editingMaid.is_active);
      setDisplayOrder(editingMaid.display_order ?? 0);
    } else {
      setName("");
      setPhotoUrl("");
      setBio("");
      setIsActive(true);
      setDisplayOrder(0);
    }
  }, [editingMaid]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        name,
        photo_url: photoUrl || null,
        bio: bio || null,
        is_active: isActive,
        display_order: displayOrder,
      };

      if (editingMaid) {
        await onUpdate(editingMaid.id, payload);
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save maid");
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
        <h3 style={{ margin: 0 }}>{editingMaid ? "Edit Maid" : "Add Maid"}</h3>
        {editingMaid ? (
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
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Photo URL</span>
        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Bio</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Display Order</span>
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(Number(e.target.value))}
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
        {submitting ? "Saving..." : editingMaid ? "Update Maid" : "Create Maid"}
      </button>
    </form>
  );
}