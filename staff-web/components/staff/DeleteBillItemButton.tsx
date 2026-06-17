"use client";

import { useState } from "react";

import {
  apiDelete,
  apiPatch,
} from "@/lib/api";

type Props = {
  orderItemId: number;
  itemName: string;
  quantity: number;
  onDeleted: () => Promise<void> | void;
};

export default function DeleteBillItemButton({
  orderItemId,
  itemName,
  quantity,
  onDeleted,
}: Props) {
  const [action, setAction] = useState<
    "minus" | "plus" | "delete" | null
  >(null);

  async function updateQuantity(
    nextQuantity: number,
    mode: "minus" | "plus",
  ) {
    try {
      setAction(mode);

      await apiPatch(
        `/staff/order-items/${orderItemId}/quantity`,
        {
          quantity: nextQuantity,
        },
      );

      await onDeleted();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to update quantity.",
      );
    } finally {
      setAction(null);
    }
  }

  async function deleteItem() {
    const confirmed = window.confirm(
      `Delete ${itemName} from this table's bill?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setAction("delete");

      await apiDelete(
        `/staff/order-items/${orderItemId}`,
      );

      await onDeleted();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to delete item.",
      );
    } finally {
      setAction(null);
    }
  }

  async function handleMinusOrDelete() {
    if (quantity > 1) {
      await updateQuantity(
        quantity - 1,
        "minus",
      );
      return;
    }

    await deleteItem();
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: 4,
        borderRadius: 12,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <button
        type="button"
        disabled={action !== null}
        onClick={() =>
          void handleMinusOrDelete()
        }
        aria-label={
          quantity > 1
            ? "Decrease quantity"
            : "Delete item"
        }
        title={
          quantity > 1
            ? "Decrease quantity"
            : "Delete item"
        }
        style={{
          width: 42,
          height: 42,
          display: "grid",
          placeItems: "center",
          borderRadius: 10,
          border:
            quantity > 1
              ? "1px solid #cbd5e1"
              : "1px solid #fecaca",
          background:
            quantity > 1
              ? "#ffffff"
              : "#fff1f2",
          color:
            quantity > 1
              ? "#111827"
              : "#be123c",
          fontSize:
            quantity > 1
              ? 22
              : 18,
          fontWeight: 950,
          cursor:
            action !== null
              ? "wait"
              : "pointer",
          opacity:
            action !== null
              ? 0.55
              : 1,
        }}
      >
        {action === "minus" ||
        action === "delete"
          ? "…"
          : quantity > 1
            ? "−"
            : "🗑"}
      </button>

      <strong
        style={{
          minWidth: 34,
          textAlign: "center",
          fontSize: 17,
        }}
      >
        {quantity}
      </strong>

      <button
        type="button"
        disabled={action !== null}
        onClick={() =>
          void updateQuantity(
            quantity + 1,
            "plus",
          )
        }
        aria-label="Increase quantity"
        title="Increase quantity"
        style={{
          width: 42,
          height: 42,
          display: "grid",
          placeItems: "center",
          borderRadius: 10,
          border: "1px solid #93c5fd",
          background: "#eff6ff",
          color: "#1d4ed8",
          fontSize: 22,
          fontWeight: 950,
          cursor:
            action !== null
              ? "wait"
              : "pointer",
          opacity:
            action !== null
              ? 0.55
              : 1,
        }}
      >
        {action === "plus"
          ? "…"
          : "+"}
      </button>
    </div>
  );
}
