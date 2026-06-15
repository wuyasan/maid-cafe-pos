"use client";

import { useEffect, useMemo, useState } from "react";

import CategoryForm from "@/components/admin/CategoryForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  MenuCategoryCreatePayload,
  MenuCategoryItem,
  MenuCategoryUpdatePayload,
  ProductionStation,
} from "@/lib/types";

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#ffffff",
  padding: 18,
  boxShadow: "0 5px 18px rgba(17, 24, 39, 0.05)",
} as const;

function stationLabel(station: ProductionStation) {
  if (station === "kitchen") return "Kitchen";
  if (station === "bar") return "Bar";
  return "No production";
}

function stationStyle(station: ProductionStation) {
  if (station === "kitchen") {
    return { background: "#ffedd5", color: "#9a3412" };
  }
  if (station === "bar") {
    return { background: "#dbeafe", color: "#1d4ed8" };
  }
  return { background: "#f3f4f6", color: "#4b5563" };
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<MenuCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCategory, setEditingCategory] =
    useState<MenuCategoryItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
      ),
    [categories],
  );

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
    void loadCategories();
  }, []);

  async function handleCreateCategory(payload: MenuCategoryCreatePayload) {
    await apiPost<MenuCategoryItem>("/menu/categories", payload);
    await loadCategories();
  }

  async function handleUpdateCategory(
    categoryId: number,
    payload: MenuCategoryUpdatePayload,
  ) {
    await apiPatch<MenuCategoryItem>(`/menu/categories/${categoryId}`, payload);
    setEditingCategory(null);
    await loadCategories();
  }

  async function handleDelete(category: MenuCategoryItem) {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(category.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(
        `/menu/categories/${category.id}`,
      );
      if (editingCategory?.id === category.id) setEditingCategory(null);
      await loadCategories();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 30 }}>Menu Categories</h1>
        <p style={{ color: "#6b7280", margin: "8px 0 0" }}>
          Organize menu items and choose which production station receives them.
        </p>
      </div>

      <div style={cardStyle}>
        <CategoryForm
          editingCategory={editingCategory}
          onCreate={handleCreateCategory}
          onUpdate={handleUpdateCategory}
          onCancelEdit={() => setEditingCategory(null)}
        />
      </div>

      <div>
        <h2 style={{ margin: "0 0 12px", fontSize: 22 }}>Category List</h2>

        {loading ? <div style={cardStyle}>Loading...</div> : null}
        {error ? (
          <div style={{ ...cardStyle, borderColor: "#fecaca", color: "#b91c1c" }}>
            {error}
          </div>
        ) : null}
        {!loading && !error && sortedCategories.length === 0 ? (
          <div style={cardStyle}>No categories yet.</div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(275px, 1fr))",
            gap: 14,
          }}
        >
          {sortedCategories.map((category) => {
            const busy = actionLoadingId === category.id;
            const badgeStyle = stationStyle(category.production_station);

            return (
              <article key={category.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: 19 }}>{category.name}</h3>
                    <div style={{ color: "#6b7280", fontSize: 13, marginTop: 5 }}>
                      Display order {category.display_order}
                    </div>
                  </div>

                  <span
                    style={{
                      ...badgeStyle,
                      borderRadius: 999,
                      padding: "5px 9px",
                      fontSize: 12,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {stationLabel(category.production_station)}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#f8fafc",
                    color: "#374151",
                    fontWeight: 700,
                  }}
                >
                  {category.item_count} menu item
                  {category.item_count === 1 ? "" : "s"}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 9,
                    marginTop: 14,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditingCategory(category)}
                    disabled={busy}
                    style={{
                      minHeight: 42,
                      borderRadius: 11,
                      border: "none",
                      background: "#4f46e5",
                      color: "#ffffff",
                      fontWeight: 800,
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDelete(category)}
                    disabled={busy || category.item_count > 0}
                    title={
                      category.item_count > 0
                        ? "Move or delete the items in this category first"
                        : "Delete category"
                    }
                    style={{
                      minHeight: 42,
                      borderRadius: 11,
                      border: "1px solid #fecaca",
                      background:
                        busy || category.item_count > 0 ? "#f3f4f6" : "#fff7f7",
                      color:
                        busy || category.item_count > 0 ? "#9ca3af" : "#b91c1c",
                      fontWeight: 800,
                      cursor:
                        busy || category.item_count > 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {busy ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
