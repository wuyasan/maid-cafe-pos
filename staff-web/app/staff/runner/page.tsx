"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import SoundControl from "@/components/staff/SoundControl";
import {
  apiGet,
  apiPostNoBody,
} from "@/lib/api";
import {
  playNotificationTone,
  showBrowserNotification,
} from "@/lib/notificationSound";
import type {
  PickupOrder,
  PickupOrderListResponse,
  PickupOrderResult,
} from "@/lib/productionTypes";

export default function RunnerPage() {
  const [orders, setOrders] = useState<
    PickupOrder[]
  >([]);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] =
    useState<number | null>(null);
  const [loading, setLoading] =
    useState(true);

  const knownReadyIds =
    useRef<Set<number> | null>(null);

  async function load(
    showLoading = false,
  ) {
    if (showLoading) {
      setLoading(true);
    }

    try {
      setError("");

      const result =
        await apiGet<PickupOrderListResponse>(
          "/staff/production/pickup/orders",
        );

      const readyIds = new Set(
        result.orders
          .filter(
            (order) =>
              order.all_completed,
          )
          .map((order) => order.order_id),
      );

      if (knownReadyIds.current !== null) {
        const newlyReady =
          result.orders.filter(
            (order) =>
              order.all_completed &&
              !knownReadyIds.current!.has(
                order.order_id,
              ),
          );

        if (newlyReady.length > 0) {
          playNotificationTone("ready");

          showBrowserNotification(
            "Order Ready for Pickup",
            newlyReady
              .map(
                (order) =>
                  `Table ${order.table_code}`,
              )
              .join(" · "),
          );
        }
      }

      knownReadyIds.current = readyIds;
      setOrders(result.orders);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load pickup orders",
      );
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load(true);

    const timer =
      window.setInterval(() => {
        void load(false);
      }, 2500);

    /*
     * iPad Safari may restore the page from its back/forward
     * cache. Reload the pickup data whenever the page becomes
     * visible or receives focus so an already-picked order does
     * not reappear from stale in-memory state.
     */
    function refreshAfterReturn() {
      void load(false);
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void load(false);
      }
    }

    window.addEventListener(
      "focus",
      refreshAfterReturn,
    );
    window.addEventListener(
      "pageshow",
      refreshAfterReturn,
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(
        "focus",
        refreshAfterReturn,
      );
      window.removeEventListener(
        "pageshow",
        refreshAfterReturn,
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  async function markPickedUp(
    order: PickupOrder,
  ) {
    if (!order.all_completed) {
      const unfinished =
        order.tasks
          .filter(
            (task) =>
              task.production_status !==
              "completed",
          )
          .map(
            (task) =>
              `${task.display_name} (${task.station}: ${task.production_status})`,
          )
          .join(", ");

      window.alert(
        `还不能取餐。后厨/水吧尚未完成：${unfinished}`,
      );
      return;
    }

    try {
      setWorkingId(order.order_id);
      setError("");

      await apiPostNoBody<PickupOrderResult>(
        `/staff/production/pickup/orders/${order.order_id}`,
      );

      /*
       * Remove immediately on this device. The database update
       * makes every other device remove it on its next poll.
       */
      setOrders((current) =>
        current.filter(
          (item) =>
            item.order_id !==
            order.order_id,
        ),
      );

      await load(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to mark order picked up";

      setError(message);
      window.alert(message);
      await load(false);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "24px 18px 64px",
        color: "#111827",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>
            Runner / Maid Pickup
          </h1>

          <p
            style={{
              margin: "7px 0 0",
              color: "#64748b",
            }}
          >
            Pickup 状态保存在数据库中，
            所有设备会同步更新。
          </p>
        </div>

        <SoundControl />
      </header>

      {error ? (
        <div
          style={{
            padding: 13,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#b91c1c",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p>Loading pickup orders...</p>
      ) : null}

      {!loading &&
      orders.length === 0 ? (
        <div
          style={{
            padding: 36,
            textAlign: "center",
            borderRadius: 18,
            border:
              "1px dashed #cbd5e1",
            color: "#64748b",
          }}
        >
          No orders waiting for pickup.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill,minmax(290px,1fr))",
          gap: 15,
        }}
      >
        {orders.map((order) => (
          <article
            key={order.order_id}
            style={{
              padding: 18,
              borderRadius: 18,
              border: order.all_completed
                ? "2px solid #22c55e"
                : "2px solid #f59e0b",
              background:
                order.all_completed
                  ? "#f0fdf4"
                  : "#fffbeb",
              boxShadow:
                "0 10px 25px rgba(15,23,42,.10)",
            }}
          >
            <div
              style={{
                color:
                  order.all_completed
                    ? "#166534"
                    : "#92400e",
                fontSize: 12,
                fontWeight: 950,
              }}
            >
              {order.all_completed
                ? "READY FOR PICKUP"
                : `PARTIALLY READY · ${order.waiting_count} WAITING`}
            </div>

            <h2
              style={{
                margin: "7px 0 12px",
                fontSize: 28,
              }}
            >
              Table {order.table_code}
            </h2>

            <div
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {order.tasks.map(
                (task) => (
                  <div
                    key={
                      task.production_task_id
                    }
                    style={{
                      padding:
                        "9px 10px",
                      borderRadius: 10,
                      background:
                        "rgba(255,255,255,.75)",
                    }}
                  >
                    <strong>
                      {task.quantity} ×{" "}
                      {task.display_name}
                    </strong>

                    <div
                      style={{
                        marginTop: 3,
                        color:
                          task.production_status ===
                          "completed"
                            ? "#166534"
                            : "#92400e",
                        fontSize: 12,
                        fontWeight: 850,
                      }}
                    >
                      {task.station} ·{" "}
                      {
                        task.production_status
                      }
                    </div>
                  </div>
                ),
              )}
            </div>

            <button
              type="button"
              disabled={
                workingId ===
                order.order_id
              }
              onClick={() =>
                void markPickedUp(order)
              }
              style={{
                width: "100%",
                minHeight: 48,
                marginTop: 16,
                border: 0,
                borderRadius: 11,
                background:
                  order.all_completed
                    ? "#166534"
                    : "#b45309",
                color: "#ffffff",
                fontWeight: 950,
                fontSize: 15,
                opacity:
                  workingId ===
                  order.order_id
                    ? 0.6
                    : 1,
              }}
            >
              {workingId ===
              order.order_id
                ? "Updating..."
                : order.all_completed
                  ? "Picked Up"
                  : "Check Before Pickup"}
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
