"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MenuCategoryItem,
  MenuItemCreatePayload,
  MenuItemRecord,
  MenuItemType,
  MenuItemUpdatePayload,
} from "@/lib/types";

type Props = {
  categories: MenuCategoryItem[];
  editingItem: MenuItemRecord | null;
  onCreate: (payload: MenuItemCreatePayload) => Promise<void>;
  onUpdate: (itemId: number, payload: MenuItemUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

export default function MenuItemForm({
  categories,
  editingItem,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemType, setItemType] = useState<MenuItemType>("regular");
  const [isActive, setIsActive] = useState(true);

  const [additionalMaidPrice, setAdditionalMaidPrice] = useState("0.00");
  const [allMaidsPrice, setAllMaidsPrice] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maidServiceCategory = useMemo(
    () => categories.find((c) => c.name.trim().toLowerCase() === "maid service"),
    [categories]
  );

  const regularCategories = useMemo(
    () => categories.filter((c) => c.name.trim().toLowerCase() !== "maid service"),
    [categories]
  );

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name ?? "");
      setDescription(editingItem.description ?? "");
      setPrice(editingItem.price ?? "");
      setImageUrl(editingItem.image_url ?? "");
      setCategoryId(editingItem.category_id ?? "");
      setItemType(editingItem.item_type);
      setIsActive(editingItem.is_active);

      if (editingItem.maid_service_pricing) {
        setAdditionalMaidPrice(
          editingItem.maid_service_pricing.additional_maid_price ?? "0.00"
        );
        setAllMaidsPrice(editingItem.maid_service_pricing.all_maids_price ?? "");
      } else {
        setAdditionalMaidPrice("0.00");
        setAllMaidsPrice("");
      }
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setImageUrl("");
      setCategoryId("");
      setItemType("regular");
      setIsActive(true);
      setAdditionalMaidPrice("0.00");
      setAllMaidsPrice("");
    }
  }, [editingItem]);

  useEffect(() => {
    if (itemType === "maid_service") {
      if (maidServiceCategory) {
        setCategoryId(maidServiceCategory.id);
      } else {
        setCategoryId("");
      }
    } else {
      if (
        categoryId !== "" &&
        categories.find((c) => c.id === categoryId)?.name.trim().toLowerCase() ===
          "maid service"
      ) {
        setCategoryId("");
      }
    }
  }, [itemType, maidServiceCategory, categories]); // intentionally not using categoryId in deps

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (itemType === "maid_service" && !maidServiceCategory) {
        throw new Error('Please create a category named "Maid Service" first.');
      }

      const payload = {
        name,
        description: description || null,
        price,
        image_url: imageUrl || null,
        category_id:
          itemType === "maid_service"
            ? maidServiceCategory?.id ?? null
            : categoryId === ""
            ? null
            : Number(categoryId),
        item_type: itemType,
        is_active: isActive,
        additional_maid_price: itemType === "maid_service" ? additionalMaidPrice : null,
        all_maids_price: itemType === "maid_service" ? allMaidsPrice || null : null,
      };

      if (editingItem) {
        await onUpdate(editingItem.id, payload);
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save menu item");
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
        <h3 style={{ margin: 0 }}>{editingItem ? "Edit Menu Item" : "Add Menu Item"}</h3>
        {editingItem ? (
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
        <span>Item Type</span>
        <select
          value={itemType}
          onChange={(e) => setItemType(e.target.value as MenuItemType)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        >
          <option value="regular">Regular</option>
          <option value="maid_service">Maid Service</option>
        </select>
      </label>

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
        <span>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Base Price</span>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Image URL</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Category</span>
        {itemType === "maid_service" ? (
          <input
            value={maidServiceCategory?.name ?? 'Please create "Maid Service" category first'}
            disabled
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#f3f4f6",
              color: "#4b5563",
            }}
          />
        ) : (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
          >
            <option value="">No category</option>
            {regularCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        )}
      </label>

      {itemType === "maid_service" ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#f9fafb",
          }}
        >
          <strong>Maid Service Pricing</strong>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Additional Maid Price</span>
            <input
              type="number"
              step="0.01"
              value={additionalMaidPrice}
              onChange={(e) => setAdditionalMaidPrice(e.target.value)}
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
        </div>
      ) : null}

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Active</span>
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
        {submitting ? "Saving..." : editingItem ? "Update Menu Item" : "Create Menu Item"}
      </button>
    </form>
  );
}