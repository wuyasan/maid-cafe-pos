"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "@/app/order/[tableCode]/order.module.css";
import type {
  MenuCategoryItem,
  MenuItemRecord,
  ProductionStation,
} from "@/lib/types";

type Props = {
  items: MenuItemRecord[];
  categories: MenuCategoryItem[];
  activeTab: "regular" | "maid_service";
  onChangeTab: (
    tab: "regular" | "maid_service",
  ) => void;
  onAddToCart: (item: MenuItemRecord) => void;
  closedStations: Record<
    ProductionStation,
    boolean
  >;
};

function formatPrice(price: string) {
  return `$${Number(price).toFixed(2)}`;
}

function stationLabel(
  station: ProductionStation,
) {
  if (station === "kitchen") return "Kitchen";
  if (station === "bar") return "Bar";
  return "";
}

export default function MenuTabs({
  items,
  categories,
  activeTab,
  onChangeTab,
  onAddToCart,
  closedStations,
}: Props) {
  const [
    regularCategoryFilter,
    setRegularCategoryFilter,
  ] = useState<"all" | number>("all");

  useEffect(() => {
    setRegularCategoryFilter("all");
  }, [activeTab]);

  const categoriesById = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          category,
        ]),
      ),
    [categories],
  );

  const regularCategories = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            category.name
              .trim()
              .toLowerCase() !==
            "maid service",
        )
        .sort(
          (a, b) =>
            a.display_order -
            b.display_order,
        ),
    [categories],
  );

  const filteredItems = useMemo(() => {
    const byType = items.filter(
      (item) =>
        item.item_type === activeTab,
    );

    if (
      activeTab !== "regular" ||
      regularCategoryFilter === "all"
    ) {
      return byType;
    }

    return byType.filter(
      (item) =>
        item.category_id ===
        regularCategoryFilter,
    );
  }, [
    items,
    activeTab,
    regularCategoryFilter,
  ]);

  function getItemStations(
    item: MenuItemRecord,
  ): ProductionStation[] {
    if (
      item.is_bundle &&
      item.components.length > 0
    ) {
      return Array.from(
        new Set(
          item.components.map(
            (component) =>
              component.production_station,
          ),
        ),
      );
    }

    if (item.category_id == null) {
      return ["none"];
    }

    return [
      categoriesById.get(
        item.category_id,
      )?.production_station ?? "none",
    ];
  }

  return (
    <section className={styles.menuSection}>
      <div className={styles.menuTabs}>
        <button
          type="button"
          onClick={() =>
            onChangeTab("regular")
          }
          className={`${styles.tabButton} ${
            activeTab === "regular"
              ? styles.active
              : ""
          }`}
        >
          Menu
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeTab("maid_service")
          }
          className={`${styles.tabButton} ${
            activeTab === "maid_service"
              ? styles.active
              : ""
          }`}
        >
          Maid Service
        </button>
      </div>

      {activeTab === "regular" ? (
        <div
          className={
            styles.categoryScroller
          }
        >
          <button
            type="button"
            onClick={() =>
              setRegularCategoryFilter(
                "all",
              )
            }
            className={`${
              styles.categoryButton
            } ${
              regularCategoryFilter ===
              "all"
                ? styles.active
                : ""
            }`}
          >
            All
          </button>

          {regularCategories.map(
            (category) => (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  setRegularCategoryFilter(
                    category.id,
                  )
                }
                className={`${
                  styles.categoryButton
                } ${
                  regularCategoryFilter ===
                  category.id
                    ? styles.active
                    : ""
                }`}
              >
                {category.name}
              </button>
            ),
          )}
        </div>
      ) : null}

      <div className={styles.menuGrid}>
        {filteredItems.map((item) => {
          const stations =
            getItemStations(item);
          const closedStation =
            stations.find(
              (station) =>
                station !== "none" &&
                closedStations[station],
            );
          const isClosed =
            closedStation != null;

          return (
            <article
              key={item.id}
              className={`${styles.menuCard} ${
                isClosed
                  ? styles.closed
                  : ""
              }`}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className={
                    styles.menuImage
                  }
                />
              ) : (
                <div
                  className={`${styles.menuImage} ${styles.placeholder}`}
                >
                  No Image
                </div>
              )}

              <div
                className={
                  styles.menuCardBody
                }
              >
                <strong
                  className={
                    styles.menuName
                  }
                >
                  {item.name}
                </strong>

                <span
                  className={
                    styles.menuDescription
                  }
                >
                  {item.description || "—"}
                </span>

                <strong
                  className={
                    styles.menuPrice
                  }
                >
                  {formatPrice(item.price)}
                </strong>

                {isClosed ? (
                  <p
                    className={
                      styles.closedText
                    }
                  >
                    {stationLabel(
                      closedStation,
                    )}{" "}
                    ordering is closed.
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={isClosed}
                  onClick={() =>
                    onAddToCart(item)
                  }
                  className={
                    styles.addCartButton
                  }
                >
                  {isClosed
                    ? "Ordering Closed"
                    : "Add to Cart"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
