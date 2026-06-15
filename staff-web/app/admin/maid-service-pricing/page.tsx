"use client";

import { useEffect, useState } from "react";
import MaidServicePricingForm from "@/components/admin/MaidServicePricingForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  MaidServicePricingCreatePayload,
  MaidServicePricingRecord,
  MaidServicePricingUpdatePayload,
  MenuItemRecord,
} from "@/lib/types";

export default function AdminMaidServicePricingPage() {
  const [pricingList, setPricingList] = useState<MaidServicePricingRecord[]>([]);
  const [maidServiceItems, setMaidServiceItems] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingPricing, setEditingPricing] = useState<MaidServicePricingRecord | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [pricingData, itemsData] = await Promise.all([
        apiGet<unknown>("/menu/maid-service-pricing"),
        apiGet<unknown>("/menu/items"),
      ]);

      if (!Array.isArray(pricingData)) {
        console.error("Unexpected /menu/maid-service-pricing response:", pricingData);
        throw new Error("Expected an array from /menu/maid-service-pricing");
      }

      if (!Array.isArray(itemsData)) {
        console.error("Unexpected /menu/items response:", itemsData);
        throw new Error("Expected an array from /menu/items");
      }

      setPricingList(pricingData as MaidServicePricingRecord[]);
      setMaidServiceItems(
        (itemsData as MenuItemRecord[]).filter((item) => item.item_type === "maid_service")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maid service pricing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(payload: MaidServicePricingCreatePayload) {
    await apiPost<MaidServicePricingRecord>("/menu/maid-service-pricing", payload);
    await loadData();
  }

  async function handleUpdate(pricingId: number, payload: MaidServicePricingUpdatePayload) {
    await apiPatch<MaidServicePricingRecord>(`/menu/maid-service-pricing/${pricingId}`, payload);
    setEditingPricing(null);
    await loadData();
  }

  async function handleDelete(pricing: MaidServicePricingRecord) {
    const confirmed = window.confirm("Delete this maid service pricing?");
    if (!confirmed) return;

    try {
      setActionLoadingId(pricing.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(
        `/menu/maid-service-pricing/${pricing.id}`
      );
      if (editingPricing?.id === pricing.id) {
        setEditingPricing(null);
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete pricing");
    } finally {
      setActionLoadingId(null);
    }
  }

  function getItemName(menuItemId: number) {
    return maidServiceItems.find((item) => item.id === menuItemId)?.name || `Item #${menuItemId}`;
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Maid Service Pricing</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Create, edit, and delete pricing for maid service menu items.
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
        <MaidServicePricingForm
          maidServiceItems={maidServiceItems}
          editingPricing={editingPricing}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onCancelEdit={() => setEditingPricing(null)}
        />

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Pricing List</h3>

          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error && pricingList.length === 0 ? <p>No pricing records yet.</p> : null}

          <div style={{ display: "grid", gap: 16 }}>
            {pricingList.map((pricing) => (
              <div
                key={pricing.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div>
                  <strong>{getItemName(pricing.menu_item_id)}</strong>
                </div>

                <div style={{ fontSize: 14, color: "#4b5563" }}>
                  <div>ID: {pricing.id}</div>
                  <div>Single Price: {pricing.single_price}</div>
                  <div>Additional Maid Price: {pricing.additional_maid_price}</div>
                  <div>All Maids Price: {pricing.all_maids_price || "—"}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setEditingPricing(pricing)}
                    disabled={actionLoadingId === pricing.id}
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
                    onClick={() => handleDelete(pricing)}
                    disabled={actionLoadingId === pricing.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === pricing.id ? "Deleting..." : "Delete"}
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