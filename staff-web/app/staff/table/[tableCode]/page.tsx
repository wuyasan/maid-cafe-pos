"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, apiPostNoBody } from "@/lib/api";
import type { BillDetail } from "@/lib/types";

type Props = {
  params: Promise<{ tableCode: string }>;
};

type CheckoutActionResponse = {
  success: boolean;
  table_code: string;
  bill_id: number;
  bill_status: string;
  session_table_status: string;
  closed_at?: string;
};

function money(v?: string | null) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function StaffSingleTablePage({ params }: Props) {
  const [tableCode, setTableCode] = useState("");
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<"start" | "paid" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    params.then((p) => setTableCode(p.tableCode));
  }, [params]);

  async function loadBill(code: string) {
    setLoading(true);
    setError("");

    try {
      const result = await apiGet<BillDetail>(
        `/customer-orders/customer/table/${code}/bill`
      );
      setBill(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bill");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tableCode) {
      loadBill(tableCode);
    }
  }, [tableCode]);

  async function handleStartCheckout() {
    if (!tableCode) return;

    try {
      setActionLoading("start");
      setMessage("");
      await apiPostNoBody<CheckoutActionResponse>(`/staff/table/${tableCode}/start-checkout`);
      await loadBill(tableCode);
      setMessage("Checkout started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkPaid() {
    if (!tableCode) return;

    try {
      setActionLoading("paid");
      setMessage("");
      await apiPostNoBody<CheckoutActionResponse>(`/staff/table/${tableCode}/mark-paid`);
      await loadBill(tableCode);
      setMessage("Bill marked as paid.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark bill as paid");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Table {tableCode}</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>Bill overview and checkout</p>
        </div>

        <Link
          href="/staff/tables"
          style={{
            textDecoration: "none",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            color: "#111827",
            background: "#fff",
          }}
        >
          Back to Tables
        </Link>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {message ? <p style={{ color: "#059669" }}>{message}</p> : null}

      {!loading && !error && bill ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 24,
            alignItems: "start",
          }}
        >
          <section
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
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Bill Items</h3>
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "#e5e7eb",
                }}
              >
                {bill.status}
              </span>
            </div>

            {bill.items.length === 0 ? (
              <p>No items yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {bill.items.map((item) => (
                  <div
                    key={item.order_item_id}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      paddingBottom: 12,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{item.menu_item_name}</strong>
                      <span>{money(item.total_price)}</span>
                    </div>

                    <div style={{ color: "#6b7280", fontSize: 14 }}>
                      Qty {item.quantity} · Unit {money(item.unit_price)}
                    </div>

                    {item.selected_maids?.length ? (
                      <div style={{ color: "#6b7280", fontSize: 14 }}>
                        Maid: {item.selected_maids.map((m) => m.maid_name).join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 20,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Checkout</h3>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Status</span>
              <span>{bill.status}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span>{money(bill.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Tax</span>
              <span>{money(bill.tax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Service</span>
              <span>{money(bill.service_charge)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 18,
                paddingTop: 8,
                borderTop: "1px solid #e5e7eb",
              }}
            >
              <span>Total</span>
              <span>{money(bill.total)}</span>
            </div>

            <button
              type="button"
              onClick={handleStartCheckout}
              disabled={actionLoading !== null || bill.status === "paid"}
              style={{
                marginTop: 8,
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {actionLoading === "start" ? "Starting..." : "Start Checkout"}
            </button>

            <button
              type="button"
              onClick={handleMarkPaid}
              disabled={actionLoading !== null || bill.status === "paid"}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "#059669",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {actionLoading === "paid" ? "Marking..." : "Mark Paid"}
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}