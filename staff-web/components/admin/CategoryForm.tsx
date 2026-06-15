"use client";

import { useEffect, useState } from "react";
import type {
  MenuCategoryCreatePayload,
  MenuCategoryItem,
  MenuCategoryUpdatePayload,
} from "@/lib/types";

type Props = {
  editingCategory: MenuCategoryItem | null;
  onCreate: (payload: MenuCategoryCreatePayload) => Promise<void>;
  onUpdate: (categoryId: number, payload: MenuCategoryUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

export default function CategoryForm({
  editingCategory,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [name, setName] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name ?? "");
      setDisplayOrder(editingCategory.display_order ?? 0);
    } else {
      setName("");
      setDisplayOrder(0);
    }
  }, [editingCategory]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        name,
        display_order: displayOrder,
      };

      if (editingCategory) {
        await onUpdate(editingCategory.id, payload);
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
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
        <h3 style={{ margin: 0 }}>{editingCategory ? "Edit Category" : "Add Category"}</h3>
        {editingCategory ? (
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
        <span>Display Order</span>
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(Number(e.target.value))}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
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
        {submitting ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
      </button>
    </form>
  );
}