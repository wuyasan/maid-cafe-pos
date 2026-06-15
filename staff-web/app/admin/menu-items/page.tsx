"use client";

import { useEffect, useState } from "react";
import MenuItemForm from "@/components/admin/MenuItemForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  MenuCategoryItem,
  MenuItemCreatePayload,
  MenuItemRecord,
  MenuItemUpdatePayload,
} from "@/lib/types";

export default function AdminMenuItemsPage() {
  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [categories, setCategories] = useState<MenuCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingItem, setEditingItem] = useState<MenuItemRecord | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [itemsData, categoriesData] = await Promise.all([
        apiGet<unknown>("/menu/items"),
        apiGet<unknown>("/menu/categories"),
      ]);

      if (!Array.isArray(itemsData)) {
        console.error("Unexpected /menu/items response:", itemsData);
        throw new Error("Expected an array from /menu/items");
      }

      if (!Array.isArray(categoriesData)) {
        console.error("Unexpected /menu/categories response:", categoriesData);
        throw new Error("Expected an array from /menu/categories");
      }

      setItems(itemsData as MenuItemRecord[]);
      setCategories(categoriesData as MenuCategoryItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menu data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(payload: MenuItemCreatePayload) {
    await apiPost<MenuItemRecord>("/menu/items-with-pricing", payload);
    await loadData();
  }

  async function handleUpdate(itemId: number, payload: MenuItemUpdatePayload) {
    await apiPatch<MenuItemRecord>(`/menu/items-with-pricing/${itemId}`, payload);
    setEditingItem(null);
    await loadData();
  }

  async function handleToggleActive(item: MenuItemRecord) {
    try {
      setActionLoadingId(item.id);
      await apiPatch<MenuItemRecord>(`/menu/items/${item.id}`, {
        is_active: !item.is_active,
      });
      if (editingItem?.id === item.id) {
        setEditingItem({
          ...editingItem,
          is_active: !item.is_active,
        });
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle menu item status");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(item: MenuItemRecord) {
    const confirmed = window.confirm(`Delete menu item "${item.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(item.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(`/menu/items/${item.id}`);
      if (editingItem?.id === item.id) {
        setEditingItem(null);
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete menu item");
    } finally {
      setActionLoadingId(null);
    }
  }

  function getCategoryName(categoryId?: number | null) {
    if (!categoryId) return "No category";
    return categories.find((c) => c.id === categoryId)?.name || `Category #${categoryId}`;
  }

  function formatItemType(itemType: string) {
    if (itemType === "maid_service") return "Maid Service";
    if (itemType === "regular") return "Regular";
    return itemType;
 }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Menu Items</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Create, edit, activate/deactivate, and delete menu items.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <MenuItemForm
          categories={categories}
          editingItem={editingItem}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onCancelEdit={() => setEditingItem(null)}
        />

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Menu Item List</h3>

          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error && items.length === 0 ? <p>No menu items yet.</p> : null}

          <div style={{ display: "grid", gap: 16 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{item.name}</strong>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: item.is_active ? "#dcfce7" : "#fee2e2",
                    }}
                  >
                    {item.is_active ? "Active" : "Inactive"}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#e5e7eb",
                    }}
                  >
                    {formatItemType(item.item_type)}
                  </span>
                </div>

                <div style={{ fontSize: 14, color: "#4b5563" }}>
                <div>ID: {item.id}</div>
                <div>Base Price: {item.price}</div>
                <div>Category: {getCategoryName(item.category_id)}</div>
                <div>Description: {item.description || "—"}</div>
                {item.item_type === "maid_service" ? (
                    <>
                    <div>
                        Additional Maid Price: {item.maid_service_pricing?.additional_maid_price || "—"}
                    </div>
                    <div>All Maids Price: {item.maid_service_pricing?.all_maids_price || "—"}</div>
                    </>
                ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setEditingItem(item)}
                    disabled={actionLoadingId === item.id}
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
                    onClick={() => handleToggleActive(item)}
                    disabled={actionLoadingId === item.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: item.is_active ? "#f59e0b" : "#10b981",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === item.id
                      ? "Saving..."
                      : item.is_active
                      ? "Set Inactive"
                      : "Set Active"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={actionLoadingId === item.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === item.id ? "Deleting..." : "Delete"}
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