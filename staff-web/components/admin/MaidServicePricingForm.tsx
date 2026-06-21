"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MaidServicePricingCreatePayload,
  MaidServicePricingRecord,
  MaidServicePricingUpdatePayload,
  MenuItemRecord,
} from "@/lib/types";

type Props = {
  maidServiceItems: MenuItemRecord[];
  editingPricing: MaidServicePricingRecord | null;
  onCreate: (payload: MaidServicePricingCreatePayload) => Promise<void>;
  onUpdate: (pricingId: number, payload: MaidServicePricingUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

export default function MaidServicePricingForm({
  maidServiceItems,
  editingPricing,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [menuItemId, setMenuItemId] = useState<number | "">("");
  const [singlePrice, setSinglePrice] = useState("");
  const [additionalMaidPrice, setAdditionalMaidPrice] = useState("0.00");
  const [allMaidsPrice, setAllMaidsPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const itemValue = useMemo(() => menuItemId, [menuItemId]);

  useEffect(() => {
    if (editingPricing) {
      setMenuItemId(editingPricing.menu_item_id);
      setSinglePrice(editingPricing.single_price ?? "");
      setAdditionalMaidPrice(editingPricing.additional_maid_price ?? "0.00");
      setAllMaidsPrice(editingPricing.all_maids_price ?? "");
    } else {
      setMenuItemId("");
      setSinglePrice("");
      setAdditionalMaidPrice("0.00");
      setAllMaidsPrice("");
    }
  }, [editingPricing]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (menuItemId === "") {
      setError("Please select a maid service item.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        menu_item_id: Number(menuItemId),
        single_price: singlePrice,
        additional_maid_price: additionalMaidPrice,
        all_maids_price: allMaidsPrice || null,
      };

      if (editingPricing) {
        await onUpdate(editingPricing.id, payload);
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pricing");
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
        <h3 style={{ margin: 0 }}>
          {editingPricing ? "Edit Maid Service Pricing" : "Add Maid Service Pricing"}
        </h3>
        {editingPricing ? (
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
        <span>Maid Service Item</span>
        <select
          value={itemValue}
          onChange={(e) => setMenuItemId(e.target.value ? Number(e.target.value) : "")}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        >
          <option value="">Select maid service item</option>
          {maidServiceItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Single Price</span>
        <input
          type="number"
          step="0.01"
          value={singlePrice}
          onChange={(e) => setSinglePrice(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Additional Maid Price</span>
        <input
          type="number"
          step="0.01"
          value={additionalMaidPrice}
          onChange={(e) => setAdditionalMaidPrice(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>All Maids Price</span>
        <input
          type="number"
          step="0.01"
          value={allMaidsPrice}
          onChange={(e) => setAllMaidsPrice(e.target.value)}
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
        {submitting ? "Saving..." : editingPricing ? "Update Pricing" : "Create Pricing"}
      </button>
    </form>
  );
}