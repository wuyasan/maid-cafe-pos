"use client";

import { useEffect, useState } from "react";

import CategoryForm from "@/components/admin/CategoryForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  MenuCategoryCreatePayload,
  MenuCategoryItem,
  MenuCategoryUpdatePayload,
  ProductionStation,
} from "@/lib/types";

function stationLabel(station: ProductionStation) {
  if (station === "kitchen") return "Kitchen";
  if (station === "bar") return "Bar";
  return "None";
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<MenuCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCategory, setEditingCategory] =
    useState<MenuCategoryItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadCategories() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<MenuCategoryItem[]>("/menu/categories");
      if (!Array.isArray(data)) {
        throw new Error("Expected an array from /menu/categories");
      }
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleCreateCategory(payload: MenuCategoryCreatePayload) {
    await apiPost("/menu/categories", payload);
    await loadCategories();
  }

  async function handleUpdateCategory(
    categoryId: number,
    payload: MenuCategoryUpdatePayload
  ) {
    await apiPatch(`/menu/categories/${categoryId}`, payload);
    setEditingCategory(null);
    await loadCategories();
  }

  async function handleDelete(category: MenuCategoryItem) {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(category.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(
        `/menu/categories/${category.id}`
      );
      if (editingCategory?.id === category.id) {
        setEditingCategory(null);
      }
      await loadCategories();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1>Menu Categories</h1>
      <p style={{ color: "#6b7280" }}>
        Assign every category to Kitchen, Bar, or None.
      </p>

      <CategoryForm
        editingCategory={editingCategory}
        onCreate={handleCreateCategory}
        onUpdate={handleUpdateCategory}
        onCancelEdit={() => setEditingCategory(null)}
      />

      <section style={{ marginTop: 24 }}>
        <h3>Category List</h3>
        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}
        {!loading && !error && categories.length === 0 ? (
          <p>No categories yet.</p>
        ) : null}

        <div style={{ display: "grid", gap: 12 }}>
          {categories.map((category) => (
            <article
              key={category.id}
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                background: "#fff",
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <strong>{category.name}</strong>
                <span style={{ color: "#4b5563", fontSize: 14 }}>
                  ID: {category.id} · Display Order: {category.display_order} · Items: {category.item_count}
                </span>
                <span style={{ fontSize: 14 }}>
                  Station: <strong>{stationLabel(category.production_station)}</strong>
                </span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditingCategory(category)}
                  disabled={actionLoadingId === category.id}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(category)}
                  disabled={actionLoadingId === category.id}
                  style={{ background: "#dc2626", color: "#fff" }}
                >
                  {actionLoadingId === category.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
