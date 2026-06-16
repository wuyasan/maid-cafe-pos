"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  MenuCategoryItem,
  MenuItemRecord,
  ProductionStation,
} from "@/lib/types";

type Props = {
  items: MenuItemRecord[];
  categories: MenuCategoryItem[];
  activeTab: "regular" | "maid_service";
  onChangeTab: (tab: "regular" | "maid_service") => void;
  onAddRegular: (item: MenuItemRecord) => void;
  onOpenMaidService: (item: MenuItemRecord) => void;
  closedStations: Record<ProductionStation, boolean>;
};

function formatPrice(price: string) {
  return `$${Number(price).toFixed(2)}`;
}

function stationLabel(station: ProductionStation) {
  if (station === "kitchen") return "Kitchen";
  if (station === "bar") return "Bar";
  return "";
}

export default function MenuTabs({
  items,
  categories,
  activeTab,
  onChangeTab,
  onAddRegular,
  onOpenMaidService,
  closedStations,
}: Props) {
  const [regularCategoryFilter, setRegularCategoryFilter] = useState<
    "all" | number
  >("all");

  useEffect(() => {
    setRegularCategoryFilter("all");
  }, [activeTab]);

  const categoriesById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  const regularCategories = useMemo(() => {
    return categories
      .filter((category) => category.name.trim().toLowerCase() !== "maid service")
      .sort((a, b) => a.display_order - b.display_order);
  }, [categories]);

  const filteredItems = useMemo(() => {
    const byType = items.filter((item) => item.item_type === activeTab);
    if (activeTab !== "regular" || regularCategoryFilter === "all") {
      return byType;
    }
    return byType.filter((item) => item.category_id === regularCategoryFilter);
  }, [items, activeTab, regularCategoryFilter]);

  function getItemStations(item: MenuItemRecord): ProductionStation[] {
    if (item.is_bundle && item.components.length > 0) {
      return Array.from(
        new Set(item.components.map((component) => component.production_station)),
      );
    }
    if (item.category_id == null) return ["none"];
    return [categoriesById.get(item.category_id)?.production_station ?? "none"];
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => onChangeTab("regular")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: activeTab === "regular" ? "#111827" : "#e5e7eb",
            color: activeTab === "regular" ? "#fff" : "#111827",
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
            background:
              activeTab === "maid_service" ? "#111827" : "#e5e7eb",
            color: activeTab === "maid_service" ? "#fff" : "#111827",
          }}
        >
          Maid Service
        </button>
      </div>

      {activeTab === "regular" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setRegularCategoryFilter("all")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "none",
              background:
                regularCategoryFilter === "all" ? "#2563eb" : "#e5e7eb",
              color: regularCategoryFilter === "all" ? "#fff" : "#111827",
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
                background:
                  regularCategoryFilter === category.id
                    ? "#2563eb"
                    : "#e5e7eb",
                color:
                  regularCategoryFilter === category.id ? "#fff" : "#111827",
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
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {filteredItems.map((item) => {
          const stations = getItemStations(item);
          const closedStation = stations.find(
            (station) => station !== "none" && closedStations[station],
          );
          const isClosed = closedStation != null;
          const closedLabel = closedStation ? stationLabel(closedStation) : "";
          const needsMaidSelection =
            item.item_type === "maid_service" || item.requires_maid_selection;

          return (
            <article
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 14,
                background: isClosed ? "#f3f4f6" : "#fff",
                opacity: isClosed ? 0.72 : 1,
                display: "grid",
                gap: 10,
              }}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  style={{
                    width: "100%",
                    height: 150,
                    objectFit: "cover",
                    borderRadius: 10,
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 150,
                    borderRadius: 10,
                    background: "#e5e7eb",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  No Image
                </div>
              )}

              <strong>{item.name}</strong>
              <span style={{ color: "#6b7280" }}>{item.description || "—"}</span>
              <strong>{formatPrice(item.price)}</strong>

              {isClosed ? (
                <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>
                  {closedLabel} ordering is closed.
                </p>
              ) : null}

              <button
                type="button"
                disabled={isClosed}
                onClick={() =>
                  needsMaidSelection
                    ? onOpenMaidService(item)
                    : onAddRegular(item)
                }
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: isClosed ? "#9ca3af" : "#111827",
                  color: "#fff",
                  cursor: isClosed ? "not-allowed" : "pointer",
                }}
              >
                {isClosed
                  ? "Ordering Closed"
                  : needsMaidSelection
                    ? "Select Maid"
                    : "Add"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
