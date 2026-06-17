"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import CartMaidPickerModal from "@/components/CartMaidPickerModal";
import MenuTabs from "@/components/MenuTabs";
import { apiGet, apiPost } from "@/lib/api";
import { clearCartDraft, restoreCartDraft, saveCartDraft } from "@/lib/cartDraft";
import type {
  BillDetail,
  CurrentSessionResponse,
  CustomerOrderPayload,
  MenuCategoryItem,
  MenuItemRecord,
  ProductionStation,
  SessionItem,
  SessionMaidAdminItem,
} from "@/lib/types";

import styles from "./order.module.css";

type Props = {
  params: Promise<{ tableCode: string }>;
};

type CartLine = {
  key: string;
  item: MenuItemRecord;
  quantity: number;
  selectedMaidIds: number[];
};

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(date.getDate()).padStart(
    2,
    "0",
  );
  return `${year}-${month}-${day}`;
}

function cutoffIsClosed(
  session: SessionItem | null,
  cutoff?: string | null,
) {
  if (!session || !cutoff) return false;

  const now = new Date();
  const today = localDateString(now);

  if (today > session.service_date) return true;
  if (today < session.service_date) return false;

  const [hour, minute, second = "0"] =
    cutoff.split(":");
  const cutoffSeconds =
    Number(hour) * 3600 +
    Number(minute) * 60 +
    Number(second);
  const nowSeconds =
    now.getHours() * 3600 +
    now.getMinutes() * 60 +
    now.getSeconds();

  return nowSeconds >= cutoffSeconds;
}

function money(value: string | number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function needsMaid(item: MenuItemRecord) {
  return (
    item.item_type === "maid_service" ||
    item.requires_maid_selection
  );
}

export default function OrderPage({
  params,
}: Props) {
  const searchParams = useSearchParams();
  const orderSource =
    searchParams.get("source") === "staff"
      ? "staff"
      : "qr";

  const [tableCode, setTableCode] =
    useState("");
  const [session, setSession] =
    useState<SessionItem | null>(null);
  const [items, setItems] = useState<
    MenuItemRecord[]
  >([]);
  const [maids, setMaids] = useState<
    SessionMaidAdminItem[]
  >([]);
  const [bill, setBill] =
    useState<BillDetail | null>(null);
  const [cart, setCart] = useState<
    CartLine[]
  >([]);
  const [draftReady, setDraftReady] = useState(false);
  const [activeTab, setActiveTab] =
    useState<
      "regular" | "maid_service"
    >("regular");
  const [categories, setCategories] =
    useState<MenuCategoryItem[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] =
    useState("");
  const [clockTick, setClockTick] =
    useState(0);
  const [mobileCartOpen, setMobileCartOpen] =
    useState(false);
  const [
    maidSelectionIndex,
    setMaidSelectionIndex,
  ] = useState<number | null>(null);

  useEffect(() => {
    params.then((value) =>
      setTableCode(value.tableCode),
    );
  }, [params]);

  useEffect(() => {
    const timer = window.setInterval(
      () =>
        setClockTick(
          (value) => value + 1,
        ),
      30000,
    );

    return () =>
      window.clearInterval(timer);
  }, []);

  async function loadBill(code: string) {
    const billData =
      await apiGet<BillDetail>(
        `/customer-orders/customer/table/${code}/bill`,
      );
    setBill(billData);
  }

  async function loadSessionMaids(
    sessionId: number,
  ) {
    const sessionMaids =
      await apiGet<
        SessionMaidAdminItem[]
      >(
        `/session-maids?session_id=${sessionId}`,
      );

    setMaids(
      sessionMaids.filter(
        (maid) => maid.is_available,
      ),
    );
  }

  async function loadPage(code: string) {
    setLoading(true);
    setError("");

    try {
      const currentSession =
        await apiGet<CurrentSessionResponse>(
          "/sessions/current",
        );

      setSession(currentSession.session);

      const [
        menuItems,
        categoryData,
        billData,
      ] = await Promise.all([
        apiGet<MenuItemRecord[]>(
          "/menu/items",
        ),
        apiGet<MenuCategoryItem[]>(
          "/menu/categories",
        ),
        apiGet<BillDetail>(
          `/customer-orders/customer/table/${code}/bill`,
        ),
      ]);

      setItems(
        menuItems.filter(
          (item) => item.is_active,
        ),
      );
      setCategories(categoryData);
      setBill(billData);
      const restoredDraft = restoreCartDraft(
        code,
        orderSource,
        currentSession.session?.id ?? null,
        menuItems.filter(
          (item) => item.is_active,
        ),
      );

      if (restoredDraft.length > 0) {
        setCart(restoredDraft);
      }

      setDraftReady(true);

      if (currentSession.session) {
        await loadSessionMaids(
          currentSession.session.id,
        );
      } else {
        setMaids([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load order page",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tableCode) {
      void loadPage(tableCode);
    }
  }, [tableCode]);
  useEffect(() => {
    if (!draftReady || !tableCode) return;

    saveCartDraft(
      tableCode,
      orderSource,
      session?.id ?? null,
      cart,
    );
  }, [
    cart,
    draftReady,
    orderSource,
    session?.id,
    tableCode,
  ]);

  const closedStations = useMemo<
    Record<ProductionStation, boolean>
  >(
    () => ({
      kitchen: cutoffIsClosed(
        session,
        session?.kitchen_last_order_time,
      ),
      bar: cutoffIsClosed(
        session,
        session?.bar_last_order_time,
      ),
      none: false,
    }),
    [session, clockTick],
  );

  const cartCount = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum + line.quantity,
        0,
      ),
    [cart],
  );

  const cartBaseTotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum +
          Number(line.item.price) *
            line.quantity,
        0,
      ),
    [cart],
  );

  function addToCart(
    item: MenuItemRecord,
  ) {
    setCart((current) => {
      const existingIndex =
        current.findIndex(
          (line) =>
            line.item.id === item.id &&
            !needsMaid(item),
        );

      if (existingIndex >= 0) {
        return current.map(
          (line, index) =>
            index === existingIndex
              ? {
                  ...line,
                  quantity:
                    line.quantity + 1,
                }
              : line,
        );
      }

      return [
        ...current,
        {
          key: `${item.id}-${Date.now()}-${Math.random()}`,
          item,
          quantity: 1,
          selectedMaidIds: [],
        },
      ];
    });
  }

  function setQuantity(
    key: string,
    quantity: number,
  ) {
    if (quantity <= 0) {
      setCart((current) =>
        current.filter(
          (line) => line.key !== key,
        ),
      );
      return;
    }

    setCart((current) =>
      current.map((line) =>
        line.key === key
          ? { ...line, quantity }
          : line,
      ),
    );
  }

  function removeLine(key: string) {
    setCart((current) =>
      current.filter(
        (line) => line.key !== key,
      ),
    );
  }

  function firstMissingMaidIndex(
    source: CartLine[],
  ) {
    return source.findIndex(
      (line) =>
        needsMaid(line.item) &&
        line.selectedMaidIds.length === 0,
    );
  }

  async function submitOrder() {
    if (!tableCode || cart.length === 0) {
      return;
    }

    const missing =
      firstMissingMaidIndex(cart);

    if (missing >= 0) {
      if (session?.id) {
        await loadSessionMaids(
          session.id,
        );
      }

      setMaidSelectionIndex(missing);
      setMobileCartOpen(false);
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const payload: CustomerOrderPayload = {
        source: orderSource,
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          notes: null,
          selected_maid_ids:
            line.selectedMaidIds,
        })),
      };

      await apiPost(
        `/customer-orders/customer/table/${tableCode}/orders`,
        payload,
      );

      clearCartDraft(tableCode, orderSource);
      setCart([]);
      setMobileCartOpen(false);
      await loadBill(tableCode);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit order",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function confirmMaidSelection(
    ids: number[],
  ) {
    if (maidSelectionIndex == null) {
      return;
    }

    const nextCart = cart.map(
      (line, index) =>
        index === maidSelectionIndex
          ? {
              ...line,
              selectedMaidIds: ids,
            }
          : line,
    );

    setCart(nextCart);

    const nextMissing =
      firstMissingMaidIndex(nextCart);

    if (nextMissing >= 0) {
      setMaidSelectionIndex(
        nextMissing,
      );
      return;
    }

    setMaidSelectionIndex(null);

    window.setTimeout(() => {
      void submitOrderWithCart(nextCart);
    }, 0);
  }

  async function submitOrderWithCart(
    lines: CartLine[],
  ) {
    if (!tableCode) return;

    try {
      setSubmitting(true);
      setError("");

      await apiPost(
        `/customer-orders/customer/table/${tableCode}/orders`,
        {
          source: orderSource,
          items: lines.map((line) => ({
            menu_item_id: line.item.id,
            quantity: line.quantity,
            notes: null,
            selected_maid_ids:
              line.selectedMaidIds,
          })),
        } satisfies CustomerOrderPayload,
      );

      clearCartDraft(tableCode, orderSource);
      setCart([]);
      setMobileCartOpen(false);
      await loadBill(tableCode);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit order",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const title = tableCode
    ? `${
        orderSource === "staff"
          ? "Staff Order · "
          : ""
      }Table ${tableCode}`
    : "Order";

  function getStaffWebUrl(path: string) {
    if (typeof window === "undefined") {
      return path;
    }

    const configured =
      process.env
        .NEXT_PUBLIC_STAFF_WEB_BASE_URL?.trim();

    if (configured) {
      return `${configured.replace(
        /\/$/,
        "",
      )}${path}`;
    }

    return `${window.location.protocol}//${window.location.hostname}:3000${path}`;
  }

  function CartAndBill() {
    return (
      <>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 style={{ margin: 0 }}>
              Cart
            </h2>
            <strong>{cartCount} item(s)</strong>
          </div>

          {cart.length === 0 ? (
            <p style={{ color: "#64748b" }}>
              Add menu items, adjust quantity,
              then submit once.
            </p>
          ) : (
            <div className={styles.cartList}>
              {cart.map((line) => (
                <article
                  key={line.key}
                  className={styles.cartLine}
                >
                  <div
                    className={
                      styles.cartLineTop
                    }
                  >
                    <strong>
                      {line.item.name}
                    </strong>
                    <strong>
                      {money(
                        Number(
                          line.item.price,
                        ) * line.quantity,
                      )}
                    </strong>
                  </div>

                  {needsMaid(line.item) ? (
                    <div
                      style={{
                        marginTop: 5,
                        color:
                          line.selectedMaidIds
                            .length > 0
                            ? "#166534"
                            : "#b45309",
                        fontSize: 12,
                        fontWeight: 850,
                      }}
                    >
                      {line.selectedMaidIds
                        .length > 0
                        ? `${line.selectedMaidIds.length} maid(s) selected`
                        : "Maid will be selected after Submit Order"}
                    </div>
                  ) : null}

                  <div
                    className={
                      styles.quantityRow
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.quantityButton
                      }
                      onClick={() =>
                        setQuantity(
                          line.key,
                          line.quantity - 1,
                        )
                      }
                    >
                      −
                    </button>

                    <strong>
                      {line.quantity}
                    </strong>

                    <button
                      type="button"
                      className={
                        styles.quantityButton
                      }
                      onClick={() =>
                        setQuantity(
                          line.key,
                          line.quantity + 1,
                        )
                      }
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className={
                        styles.removeButton
                      }
                      onClick={() =>
                        removeLine(line.key)
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div
            className={styles.totalRow}
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            <span>Base subtotal</span>
            <strong>
              {money(cartBaseTotal)}
            </strong>
          </div>

          <button
            type="button"
            disabled={
              cart.length === 0 ||
              submitting
            }
            onClick={() =>
              void submitOrder()
            }
            className={
              styles.submitButton
            }
          >
            {submitting
              ? "Submitting..."
              : "Submit Order"}
          </button>

          <small
            style={{
              display: "block",
              marginTop: 8,
              color: "#64748b",
            }}
          >
            Maid-service pricing and final
            totals are calculated by the
            backend.
          </small>
        </section>

        {bill ? (
          <section className={styles.panel}>
            <div
              className={styles.panelHeader}
            >
              <h2 style={{ margin: 0 }}>
                Current Bill
              </h2>
              <strong>
                {money(bill.total)}
              </strong>
            </div>

            <div className={styles.billItems}>
              {bill.items.length === 0 ? (
                <span
                  style={{
                    color: "#64748b",
                  }}
                >
                  No submitted items yet.
                </span>
              ) : (
                bill.items.map((item) => (
                  <div
                    key={
                      item.order_item_id
                    }
                    className={
                      styles.billItem
                    }
                  >
                    <span>
                      {item.quantity}×{" "}
                      {item.menu_item_name}
                    </span>
                    <strong>
                      {money(
                        item.total_price,
                      )}
                    </strong>
                  </div>
                ))
              )}
            </div>

            <div
              className={styles.totalRow}
            >
              <span>Total</span>
              <strong>
                {money(bill.total)}
              </strong>
            </div>
          </section>
        ) : null}
      </>
    );
  }

  return (
    <main className={styles.page}>
      {orderSource === "staff" ? (
        <div
          className={styles.staffActions}
        >
          <button
            type="button"
            onClick={() => {
              window.location.href =
                getStaffWebUrl(
                  "/staff/order",
                );
            }}
            className={
              styles.secondaryButton
            }
          >
            ← Table Selection
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href =
                getStaffWebUrl("/staff");
            }}
            className={
              styles.secondaryButton
            }
          >
            Switch View
          </button>
        </div>
      ) : null}

      <h1>{title}</h1>

      <p style={{ color: "#6b7280" }}>
        {session
          ? `Current Session: ${session.name}`
          : "No active session"}
      </p>

      {closedStations.kitchen ? (
        <p className={styles.notice}>
          Kitchen ordering is closed.
        </p>
      ) : null}

      {closedStations.bar ? (
        <p className={styles.notice}>
          Bar ordering is closed.
        </p>
      ) : null}

      {loading ? <p>Loading...</p> : null}

      {error ? (
        <p style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}

      {!loading ? (
        <div className={styles.orderLayout}>
          <MenuTabs
            items={items}
            categories={categories}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            onAddToCart={addToCart}
            closedStations={
              closedStations
            }
          />

          <aside className={styles.sidebar}>
            <CartAndBill />
          </aside>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() =>
          setMobileCartOpen(true)
        }
        className={
          styles.mobileCartButton
        }
      >
        <span>
          Cart · {cartCount}
        </span>
        <span>
          {money(cartBaseTotal)}
        </span>
      </button>

      <div
        className={`${styles.mobileDrawerBackdrop} ${
          mobileCartOpen
            ? styles.open
            : ""
        }`}
        onClick={() =>
          setMobileCartOpen(false)
        }
      >
        <section
          className={styles.mobileDrawer}
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <div
            className={styles.panelHeader}
            style={{ marginBottom: 12 }}
          >
            <strong style={{ fontSize: 20 }}>
              Order & Current Bill
            </strong>
            <button
              type="button"
              onClick={() =>
                setMobileCartOpen(false)
              }
              className={
                styles.closeButton
              }
            >
              ×
            </button>
          </div>

          <CartAndBill />
        </section>
      </div>

      {maidSelectionIndex != null &&
      cart[maidSelectionIndex] ? (
        <CartMaidPickerModal
          item={
            cart[maidSelectionIndex]
              .item
          }
          maids={maids}
          initialSelectedIds={
            cart[maidSelectionIndex]
              .selectedMaidIds
          }
          onCancel={() =>
            setMaidSelectionIndex(null)
          }
          onConfirm={
            confirmMaidSelection
          }
        />
      ) : null}
    </main>
  );
}
