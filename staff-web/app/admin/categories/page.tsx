"use client";

import { useEffect, useState } from "react";
import CategoryForm from "@/components/admin/CategoryForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  MenuCategoryCreatePayload,
  MenuCategoryItem,
  MenuCategoryUpdatePayload,
} from "@/lib/types";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<MenuCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCategory, setEditingCategory] = useState<MenuCategoryItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadCategories() {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet<unknown>("/menu/categories");

      if (!Array.isArray(data)) {
        console.error("Unexpected /menu/categories response:", data);
        throw new Error("Expected an array from /menu/categories");
      }

      setCategories(data as MenuCategoryItem[]);
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
    await apiPost<MenuCategoryItem>("/menu/categories", payload);
    await loadCategories();
  }

  async function handleUpdateCategory(categoryId: number, payload: MenuCategoryUpdatePayload) {
    await apiPatch<MenuCategoryItem>(`/menu/categories/${categoryId}`, payload);
    setEditingCategory(null);
    await loadCategories();
  }

  async function handleDelete(category: MenuCategoryItem) {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(category.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(`/menu/categories/${category.id}`);
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
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Menu Categories</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Create, edit, and delete menu categories.
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
        <CategoryForm
          editingCategory={editingCategory}
          onCreate={handleCreateCategory}
          onUpdate={handleUpdateCategory}
          onCancelEdit={() => setEditingCategory(null)}
        />

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Category List</h3>

          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error && categories.length === 0 ? <p>No categories yet.</p> : null}

          <div style={{ display: "grid", gap: 16 }}>
            {categories.map((category) => (
              <div
                key={category.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{category.name}</strong>
                </div>

                <div style={{ fontSize: 14, color: "#4b5563" }}>
                  <div>ID: {category.id}</div>
                  <div>Display Order: {category.display_order}</div>
                  <div>Items: {category.item_count}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setEditingCategory(category)}
                    disabled={actionLoadingId === category.id}
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
                    onClick={() => handleDelete(category)}
                    disabled={actionLoadingId === category.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === category.id ? "Deleting..." : "Delete"}
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