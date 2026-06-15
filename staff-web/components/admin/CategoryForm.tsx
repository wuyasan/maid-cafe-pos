"use client";

import { useEffect, useState } from "react";

import type {
  MenuCategoryCreatePayload,
  MenuCategoryItem,
  MenuCategoryUpdatePayload,
  ProductionStation,
} from "@/lib/types";

type Props = {
  editingCategory: MenuCategoryItem | null;
  onCreate: (payload: MenuCategoryCreatePayload) => Promise<void>;
  onUpdate: (
    categoryId: number,
    payload: MenuCategoryUpdatePayload
  ) => Promise<void>;
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
  const [productionStation, setProductionStation] =
    useState<ProductionStation>("none");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name ?? "");
      setDisplayOrder(editingCategory.display_order ?? 0);
      setProductionStation(editingCategory.production_station ?? "none");
    } else {
      setName("");
      setDisplayOrder(0);
      setProductionStation("none");
    }
  }, [editingCategory]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        name,
        display_order: displayOrder,
        production_station: productionStation,
      };

      if (editingCategory) {
        await onUpdate(editingCategory.id, payload);
      } else {
        await onCreate(payload);
        setName("");
        setDisplayOrder(0);
        setProductionStation("none");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        padding: 20,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>
          {editingCategory ? "Edit Category" : "Add Category"}
        </h3>
        {editingCategory ? (
          <button type="button" onClick={onCancelEdit}>
            Cancel
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
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

        <label style={{ display: "grid", gap: 6 }}>
          <span>Production Station</span>
          <select
            value={productionStation}
            onChange={(e) =>
              setProductionStation(e.target.value as ProductionStation)
            }
            style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
          >
            <option value="none">None / No preparation ticket</option>
            <option value="kitchen">Kitchen</option>
            <option value="bar">Bar</option>
          </select>
        </label>

        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Every item in this category inherits this station.
        </p>

        {error ? <p style={{ color: "#dc2626", margin: 0 }}>{error}</p> : null}

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
          {submitting
            ? "Saving..."
            : editingCategory
              ? "Update Category"
              : "Create Category"}
        </button>
      </form>
    </section>
  );
}
