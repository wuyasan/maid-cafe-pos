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

const buttonBase: React.CSSProperties = {
  minHeight: 40,
  padding: "9px 14px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};

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

  useEffect(() => { void loadData(); }, []);

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
    <main style={{ padding: 24, display: "grid", gap: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Menu Items</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>Create regular items, maid services, and combos.</p>
      </div>

      <MenuItemForm categories={categories} allItems={items} editingItem={editingItem} onCreate={handleCreate} onUpdate={handleUpdate} onCancelEdit={() => setEditingItem(null)} />

      <section style={{ display: "grid", gap: 14 }}>
        <h2 style={{ marginBottom: 0 }}>Menu Item List</h2>
        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {!loading && !error && items.length === 0 ? <p>No menu items yet.</p> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          {items.map((item) => (
            <article key={item.id} style={{ border: "1px solid #d1d5db", borderRadius: 16, padding: 18, display: "grid", gap: 10, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <strong style={{ fontSize: 18 }}>{item.name}</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                    <span style={{ padding: "3px 8px", borderRadius: 999, background: item.is_active ? "#d1fae5" : "#fee2e2", color: item.is_active ? "#065f46" : "#991b1b", fontSize: 12, fontWeight: 700 }}>{item.is_active ? "Active" : "Inactive"}</span>
                    <span style={{ padding: "3px 8px", borderRadius: 999, background: "#e0e7ff", color: "#3730a3", fontSize: 12, fontWeight: 700 }}>{item.item_type === "maid_service" ? "Maid Service" : item.is_bundle ? "Combo" : "Regular"}</span>
                  </div>
                </div>
                <strong style={{ fontSize: 18 }}>${Number(item.price).toFixed(2)}</strong>
              </div>

              <div style={{ color: "#4b5563", lineHeight: 1.6 }}>
                <div><strong>Category:</strong> {categoryName(item.category_id)}</div>
                <div><strong>Description:</strong> {item.description || "—"}</div>
              </div>

              {item.is_bundle ? (
                <div style={{ padding: 12, background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 12 }}>
                  <strong>Combo Components</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {item.components.map((component) => (
                      <li key={component.id}>{component.quantity} × {component.menu_item_name} · {component.item_type === "maid_service" ? "Maid Service" : component.production_station}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {item.item_type === "maid_service" ? (
                <div style={{ padding: 10, borderRadius: 10, background: "#f9fafb" }}>
                  Additional Maid: ${Number(item.maid_service_pricing?.additional_maid_price ?? 0).toFixed(2)}<br />
                  All Maids: {item.maid_service_pricing?.all_maids_price != null ? `$${Number(item.maid_service_pricing.all_maids_price).toFixed(2)}` : "—"}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => { setEditingItem(item); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={actionLoadingId === item.id} style={{ ...buttonBase, border: "1px solid #7c3aed", background: "#fff", color: "#6d28d9" }}>Edit</button>
                <button type="button" onClick={() => handleToggleActive(item)} disabled={actionLoadingId === item.id} style={{ ...buttonBase, border: "none", background: item.is_active ? "#f59e0b" : "#059669", color: "#fff" }}>{actionLoadingId === item.id ? "Saving..." : item.is_active ? "Deactivate" : "Activate"}</button>
                <button type="button" onClick={() => handleDelete(item)} disabled={actionLoadingId === item.id} style={{ ...buttonBase, border: "none", background: "#dc2626", color: "#fff" }}>{actionLoadingId === item.id ? "Working..." : "Delete"}</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
