"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiGet, apiPostNoBody } from "@/lib/api";
import {
  enableSound,
  isSoundEnabled,
  playNotificationTone,
} from "@/lib/notificationSound";
import type {
  PickupOrder,
  PickupOrderListResponse,
  PickupOrderResult,
} from "@/lib/productionTypes";

export default function GlobalPickupNotifier() {
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(
    null,
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [message, setMessage] = useState("");

  const knownReadyIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    setSoundEnabled(isSoundEnabled());
  }, []);

  async function load() {
    try {
      const result = await apiGet<PickupOrderListResponse>(
        "/staff/production/pickup/orders",
      );

      const fullyReadyIds = new Set(
        result.orders
          .filter((order) => order.all_completed)
          .map((order) => order.order_id),
      );

      if (knownReadyIds.current !== null) {
        const newlyReady = result.orders.filter(
          (order) =>
            order.all_completed &&
            !knownReadyIds.current!.has(order.order_id),
        );

        if (newlyReady.length > 0) {
          playNotificationTone("ready");
          setOpen(true);
        }
      }

      knownReadyIds.current = fullyReadyIds;
      setOrders(result.orders);
    } catch {
      // Keep global staff pages usable if notification polling fails.
    }
  }

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 2500);

    return () => window.clearInterval(timer);
  }, []);

  const readyCount = useMemo(
    () => orders.filter((order) => order.all_completed).length,
    [orders],
  );

  async function turnOnSound() {
    try {
      await enableSound();
      setSoundEnabled(true);
      setMessage("Sound enabled on this device.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not enable sound.",
      );
    }
  }

  async function pickup(order: PickupOrder) {
    if (!order.all_completed) {
      const unfinished = order.tasks
        .filter(
          (task) => task.production_status !== "completed",
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
      setMessage("");

      await apiPostNoBody<PickupOrderResult>(
        `/staff/production/pickup/orders/${order.order_id}`,
      );

      // Immediate local removal; other devices disappear within 2.5 seconds.
      setOrders((current) =>
        current.filter(
          (item) => item.order_id !== order.order_id,
        ),
      );

      await load();
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "Pickup failed.";

      window.alert(text);
      setMessage(text);
      await load();
    } finally {
      setWorkingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!soundEnabled) {
            void turnOnSound();
          }
        }}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 100,
          minHeight: 44,
          padding: "10px 14px",
          borderRadius: 999,
          border: "1px solid #d1d5db",
          background: "#ffffff",
          color: "#374151",
          boxShadow: "0 10px 28px rgba(15,23,42,.14)",
          fontWeight: 850,
        }}
      >
        {soundEnabled ? "🔔 Pickup alerts on" : "🔇 Enable alerts"}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 101,
          minHeight: 54,
          padding: "12px 17px",
          borderRadius: 999,
          border: 0,
          background: readyCount > 0 ? "#dc2626" : "#d97706",
          color: "#ffffff",
          boxShadow: "0 14px 34px rgba(15,23,42,.25)",
          fontWeight: 950,
          fontSize: 15,
        }}
      >
        🔔 Pickup {readyCount > 0 ? `${readyCount} ready` : "waiting"}
      </button>

      {open ? (
        <aside
          style={{
            position: "fixed",
            right: 18,
            bottom: 84,
            zIndex: 100,
            width: "min(430px, calc(100vw - 36px))",
            maxHeight: "70vh",
            overflowY: "auto",
            borderRadius: 20,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            boxShadow: "0 20px 55px rgba(15,23,42,.25)",
            padding: 15,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <strong style={{ fontSize: 19 }}>
                Runner Pickup
              </strong>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                全部 Staff 页面都会收到
              </div>
            </div>

            {!soundEnabled ? (
              <button
                type="button"
                onClick={() => void turnOnSound()}
                style={{
                  padding: "8px 11px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  fontWeight: 850,
                }}
              >
                Enable sound
              </button>
            ) : (
              <span style={{ color: "#166534", fontWeight: 850 }}>
                🔊 Sound on
              </span>
            )}
          </div>

          {message ? (
            <div
              style={{
                padding: 9,
                marginBottom: 10,
                borderRadius: 10,
                background: "#f8fafc",
                color: "#475569",
                fontSize: 12,
              }}
            >
              {message}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 11 }}>
            {orders.map((order) => (
              <article
                key={order.order_id}
                style={{
                  padding: 14,
                  borderRadius: 15,
                  border: order.all_completed
                    ? "2px solid #22c55e"
                    : "2px solid #f59e0b",
                  background: order.all_completed
                    ? "#f0fdf4"
                    : "#fffbeb",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 22 }}>
                      Table {order.table_code}
                    </strong>
                    <div
                      style={{
                        marginTop: 3,
                        color: order.all_completed
                          ? "#166534"
                          : "#92400e",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      {order.all_completed
                        ? "READY FOR PICKUP"
                        : `PARTIALLY READY · ${order.waiting_count} waiting`}
                    </div>
                  </div>

                  <span style={{ color: "#64748b", fontSize: 12 }}>
                    Order #{order.order_id}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 5,
                    marginTop: 10,
                    marginBottom: 12,
                  }}
                >
                  {order.tasks.map((task) => (
                    <div
                      key={task.production_task_id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <span>
                        {task.quantity}× {task.display_name}
                      </span>
                      <strong
                        style={{
                          color:
                            task.production_status === "completed"
                              ? "#166534"
                              : "#92400e",
                        }}
                      >
                        {task.station} · {task.production_status}
                      </strong>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={
                    workingId === order.order_id
                  }
                  onClick={() => void pickup(order)}
                  style={{
                    width: "100%",
                    minHeight: 46,
                    border: 0,
                    borderRadius: 11,
                    background: order.all_completed
                      ? "#15803d"
                      : "#b45309",
                    color: "#ffffff",
                    fontWeight: 950,
                    fontSize: 15,
                    opacity:
                      workingId === order.order_id ? 0.6 : 1,
                  }}
                >
                  {workingId === order.order_id
                    ? "Updating..."
                    : order.all_completed
                      ? "Picked Up"
                      : "Check Before Pickup"}
                </button>
              </article>
            ))}
          </div>
        </aside>
      ) : null}
    </>
  );
}
