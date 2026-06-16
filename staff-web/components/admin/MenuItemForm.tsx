"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BundleComponentPayload,
  MenuCategoryItem,
  MenuItemCreatePayload,
  MenuItemRecord,
  MenuItemType,
  MenuItemUpdatePayload,
} from "@/lib/types";

type Props = {
  categories: MenuCategoryItem[];
  allItems: MenuItemRecord[];
  editingItem: MenuItemRecord | null;
  onCreate: (payload: MenuItemCreatePayload) => Promise<void>;
  onUpdate: (itemId: number, payload: MenuItemUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

export default function MenuItemForm({
  categories,
  allItems,
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
  const [isBundle, setIsBundle] = useState(false);
  const [components, setComponents] = useState<BundleComponentPayload[]>([]);
  const [additionalMaidPrice, setAdditionalMaidPrice] = useState("0.00");
  const [allMaidsPrice, setAllMaidsPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maidServiceCategory = useMemo(
    () => categories.find((c) => c.name.trim().toLowerCase() === "maid service"),
    [categories],
  );

  const regularCategories = useMemo(
    () => categories.filter((c) => c.name.trim().toLowerCase() !== "maid service"),
    [categories],
  );

  const componentChoices = useMemo(
    () =>
      allItems.filter(
        (item) =>
          item.id !== editingItem?.id &&
          !item.is_bundle &&
          item.is_active,
      ),
    [allItems, editingItem],
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
      setIsBundle(editingItem.is_bundle ?? false);
      setComponents(
        (editingItem.components ?? []).map((component) => ({
          menu_item_id: component.menu_item_id,
          quantity: component.quantity,
        })),
      );
      setAdditionalMaidPrice(
        editingItem.maid_service_pricing?.additional_maid_price ?? "0.00",
      );
      setAllMaidsPrice(
        editingItem.maid_service_pricing?.all_maids_price ?? "",
      );
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setImageUrl("");
      setCategoryId("");
      setItemType("regular");
      setIsActive(true);
      setIsBundle(false);
      setComponents([]);
      setAdditionalMaidPrice("0.00");
      setAllMaidsPrice("");
    }
  }, [editingItem]);

  useEffect(() => {
    if (itemType === "maid_service") {
      setIsBundle(false);
      setComponents([]);
      setCategoryId(maidServiceCategory?.id ?? "");
      return;
    }
    if (
      categoryId !== "" &&
      categories.find((c) => c.id === categoryId)?.name.trim().toLowerCase() ===
        "maid service"
    ) {
      setCategoryId("");
    }
  }, [itemType, maidServiceCategory, categories]);

  function addComponent() {
    const firstUnused = componentChoices.find(
      (item) => !components.some((component) => component.menu_item_id === item.id),
    );
    if (!firstUnused) return;
    setComponents((current) => [
      ...current,
      { menu_item_id: firstUnused.id, quantity: 1 },
    ]);
  }

  function updateComponent(
    index: number,
    patch: Partial<BundleComponentPayload>,
  ) {
    setComponents((current) =>
      current.map((component, i) =>
        i === index ? { ...component, ...patch } : component,
      ),
    );
  }

  function removeComponent(index: number) {
    setComponents((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (itemType === "maid_service" && !maidServiceCategory) {
        throw new Error('Please create a category named "Maid Service" first.');
      }
      if (isBundle && components.length === 0) {
        throw new Error("A combo must contain at least one component.");
      }
      const duplicateIds = components
        .map((component) => component.menu_item_id)
        .filter((id, index, ids) => ids.indexOf(id) !== index);
      if (duplicateIds.length > 0) {
        throw new Error("The same component cannot be added twice.");
      }

      const payload: MenuItemCreatePayload = {
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
        is_bundle: isBundle,
        components: isBundle ? components : [],
        additional_maid_price:
          itemType === "maid_service" ? additionalMaidPrice : null,
        all_maids_price:
          itemType === "maid_service" ? allMaidsPrice || null : null,
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
        display: "grid",
        gap: 14,
        padding: 18,
        border: "1px solid #e5e7eb",
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0 }}>
          {editingItem ? "Edit Menu Item" : "Add Menu Item"}
        </h3>
        {editingItem ? <button type="button" onClick={onCancelEdit}>Cancel</button> : null}
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

      {itemType === "regular" ? (
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={isBundle}
            onChange={(e) => {
              setIsBundle(e.target.checked);
              if (!e.target.checked) setComponents([]);
            }}
          />
          <span>This item is a combo / bundle</span>
        </label>
      ) : null}

      <label style={{ display: "grid", gap: 6 }}>
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Sale Price</span>
        <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Image URL</span>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Category</span>
        {itemType === "maid_service" ? (
          <input value={maidServiceCategory?.name ?? 'Please create "Maid Service" category first'} disabled />
        ) : (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">No category</option>
            {regularCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        )}
      </label>

      {isBundle ? (
        <section style={{ display: "grid", gap: 12, padding: 14, border: "1px solid #c4b5fd", borderRadius: 12, background: "#faf5ff" }}>
          <div>
            <strong>Combo Components</strong>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
              The customer sees and pays for the combo. Kitchen and bar receive production components separately. Maid Service components will require maid selection when ordering.
            </p>
          </div>

          {components.map((component, index) => {
            const selectedIds = new Set(components.map((entry) => entry.menu_item_id));
            return (
              <div key={`${component.menu_item_id}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 100px auto", gap: 8 }}>
                <select
                  value={component.menu_item_id}
                  onChange={(e) => updateComponent(index, { menu_item_id: Number(e.target.value) })}
                >
                  {componentChoices
                    .filter((item) => item.id === component.menu_item_id || !selectedIds.has(item.id))
                    .map((item) => {
                      const category = categories.find((c) => c.id === item.category_id);
                      return (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.item_type === "maid_service" ? "Maid Service" : category?.production_station ?? "none"}
                        </option>
                      );
                    })}
                </select>
                <input
                  type="number"
                  min={1}
                  value={component.quantity}
                  onChange={(e) => updateComponent(index, { quantity: Math.max(1, Number(e.target.value || 1)) })}
                />
                <button type="button" onClick={() => removeComponent(index)}>Remove</button>
              </div>
            );
          })}

          <button type="button" onClick={addComponent} disabled={components.length >= componentChoices.length}>
            Add Component
          </button>
        </section>
      ) : null}

      {itemType === "maid_service" ? (
        <section style={{ display: "grid", gap: 12, padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <strong>Maid Service Pricing</strong>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Additional Maid Price</span>
            <input type="number" step="0.01" value={additionalMaidPrice} onChange={(e) => setAdditionalMaidPrice(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>All Maids Price</span>
            <input type="number" step="0.01" value={allMaidsPrice} onChange={(e) => setAllMaidsPrice(e.target.value)} />
          </label>
        </section>
      ) : null}

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Active</span>
      </label>

      {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : editingItem ? "Update Menu Item" : "Create Menu Item"}
      </button>
    </form>
  );
}
