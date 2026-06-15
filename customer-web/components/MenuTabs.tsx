"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuCategoryItem, MenuItemRecord } from "@/lib/types";

type Props = {
  items: MenuItemRecord[];
  categories: MenuCategoryItem[];
  activeTab: "regular" | "maid_service";
  onChangeTab: (tab: "regular" | "maid_service") => void;
  onAddRegular: (item: MenuItemRecord) => void;
  onOpenMaidService: (item: MenuItemRecord) => void;
};

function formatPrice(price: string) {
  return `$${Number(price).toFixed(2)}`;
}

export default function MenuTabs({
  items,
  categories,
  activeTab,
  onChangeTab,
  onAddRegular,
  onOpenMaidService,
}: Props) {
  const [regularCategoryFilter, setRegularCategoryFilter] = useState<"all" | number>("all");

  useEffect(() => {
    setRegularCategoryFilter("all");
  }, [activeTab]);

  const regularCategories = useMemo(() => {
    return categories
      .filter((category) => category.name.trim().toLowerCase() !== "maid service")
      .sort((a, b) => a.display_order - b.display_order);
  }, [categories]);

  const filteredItems = useMemo(() => {
    const byType = items.filter((item) => item.item_type === activeTab);

    if (activeTab !== "regular") {
      return byType;
    }

    if (regularCategoryFilter === "all") {
      return byType;
    }

    return byType.filter((item) => item.category_id === regularCategoryFilter);
  }, [items, activeTab, regularCategoryFilter]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onChangeTab("regular")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: activeTab === "regular" ? "#111827" : "#e5e7eb",
            color: activeTab === "regular" ? "#fff" : "#111827",
            cursor: "pointer",
          }}
        >
          Regular
        </button>

        <button
          type="button"
          onClick={() => onChangeTab("maid_service")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: activeTab === "maid_service" ? "#111827" : "#e5e7eb",
            color: activeTab === "maid_service" ? "#fff" : "#111827",
            cursor: "pointer",
          }}
        >
          Maid Service
        </button>
      </div>

      {activeTab === "regular" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setRegularCategoryFilter("all")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "none",
              background: regularCategoryFilter === "all" ? "#2563eb" : "#e5e7eb",
              color: regularCategoryFilter === "all" ? "#fff" : "#111827",
              cursor: "pointer",
            }}
          >
            All
          </button>

          {regularCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setRegularCategoryFilter(category.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "none",
                background: regularCategoryFilter === category.id ? "#2563eb" : "#e5e7eb",
                color: regularCategoryFilter === category.id ? "#fff" : "#111827",
                cursor: "pointer",
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {filteredItems.map((item) => (
          <div
            key={item.id}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 16,
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 12,
                background: "#f3f4f6",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: 12,
              }}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                "No Image"
              )}
            </div>

            <div>
              <strong>{item.name}</strong>
              <p style={{ margin: "6px 0 0", color: "#4b5563", minHeight: 40 }}>
                {item.description || "—"}
              </p>
            </div>

            <div style={{ fontWeight: 600 }}>{formatPrice(item.price)}</div>

            {item.item_type === "regular" ? (
              <button
                type="button"
                onClick={() => onAddRegular(item)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenMaidService(item)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Select Maid
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}