"use client";

import type { BillDetail } from "@/lib/types";

type Props = {
  bill: BillDetail | null;
};

function money(v?: string) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function BillPanel({ bill }: Props) {
  return (
    <aside
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        display: "grid",
        gap: 16,
        alignSelf: "start",
        position: "sticky",
        top: 20,
      }}
    >
      <div>
        <h3 style={{ margin: 0 }}>Current Bill</h3>
        <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
          {bill ? `Bill #${bill.id}` : "No bill"}
        </p>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {bill?.items?.length ? (
          bill.items.map((item) => (
            <div
              key={item.order_item_id}
              style={{
                paddingBottom: 12,
                borderBottom: "1px solid #f3f4f6",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{item.menu_item_name}</strong>
                <span>{money(item.total_price)}</span>
              </div>

              <div style={{ fontSize: 14, color: "#6b7280" }}>
                Qty {item.quantity} · Unit {money(item.unit_price)}
              </div>

              {item.selected_maids?.length ? (
                <div style={{ fontSize: 14, color: "#6b7280" }}>
                  Maid: {item.selected_maids.map((m) => m.maid_name).join(", ")}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p style={{ margin: 0, color: "#6b7280" }}>No items yet.</p>
        )}
      </div>

      <div style={{ display: "grid", gap: 8, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <span>{money(bill?.subtotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Tax</span>
          <span>{money(bill?.tax)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Service</span>
          <span>{money(bill?.service_charge)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>Total</span>
          <span>{money(bill?.total)}</span>
        </div>
      </div>
    </aside>
  );
}