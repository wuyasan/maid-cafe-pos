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
        apiGet<MenuItemRecord[]>("/menu/items"),
        apiGet<MenuCategoryItem[]>("/menu/categories"),
      ]);
      setItems(itemsData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menu data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreate(payload: MenuItemCreatePayload) {
    await apiPost("/menu/items-with-pricing", payload);
    await loadData();
  }

  async function handleUpdate(itemId: number, payload: MenuItemUpdatePayload) {
    await apiPatch(`/menu/items-with-pricing/${itemId}`, payload);
    setEditingItem(null);
    await loadData();
  }

  async function handleToggleActive(item: MenuItemRecord) {
    try {
      setActionLoadingId(item.id);
      await apiPatch(`/menu/items/${item.id}`, { is_active: !item.is_active });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(item: MenuItemRecord) {
    if (!window.confirm(`Delete menu item "${item.name}"?`)) return;
    try {
      setActionLoadingId(item.id);
      await apiDelete(`/menu/items/${item.id}`);
      if (editingItem?.id === item.id) setEditingItem(null);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setActionLoadingId(null);
    }
  }

  function categoryName(id?: number | null) {
    return categories.find((category) => category.id === id)?.name ?? "No category";
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <div>
        <h1>Menu Items</h1>
        <p>Create regular items, maid services, and combos.</p>
      </div>

      <MenuItemForm
        categories={categories}
        allItems={items}
        editingItem={editingItem}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onCancelEdit={() => setEditingItem(null)}
      />

      <section style={{ display: "grid", gap: 12 }}>
        <h2>Menu Item List</h2>
        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {!loading && !error && items.length === 0 ? <p>No menu items yet.</p> : null}

        {items.map((item) => (
          <article key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{item.name}</strong>
                {item.is_bundle ? <span style={{ marginLeft: 8, color: "#7c3aed" }}>Combo</span> : null}
                <span style={{ marginLeft: 8, color: item.is_active ? "#047857" : "#b91c1c" }}>
                  {item.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <strong>${item.price}</strong>
            </div>
            <div>Type: {item.item_type === "maid_service" ? "Maid Service" : "Regular"}</div>
            <div>Category: {categoryName(item.category_id)}</div>
            <div>Description: {item.description || "—"}</div>

            {item.is_bundle ? (
              <div style={{ padding: 10, background: "#faf5ff", borderRadius: 10 }}>
                <strong>Components</strong>
                <ul style={{ marginBottom: 0 }}>
                  {item.components.map((component) => (
                    <li key={component.id}>
                      {component.quantity} × {component.menu_item_name} → {component.production_station}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {item.item_type === "maid_service" ? (
              <div>
                Additional Maid Price: {item.maid_service_pricing?.additional_maid_price ?? "—"}<br />
                All Maids Price: {item.maid_service_pricing?.all_maids_price ?? "—"}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setEditingItem(item)} disabled={actionLoadingId === item.id}>Edit</button>
              <button onClick={() => handleToggleActive(item)} disabled={actionLoadingId === item.id}>
                {item.is_active ? "Set Inactive" : "Set Active"}
              </button>
              <button onClick={() => handleDelete(item)} disabled={actionLoadingId === item.id}>Delete</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
