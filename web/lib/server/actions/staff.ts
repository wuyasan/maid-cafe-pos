"use server";
import { assertStaffAction, getSession } from "@/lib/server/auth";
import { ApiError, api } from "@/lib/server/api-client";
import type {
  StartCheckoutResponse,
  CancelCheckoutResponse,
  MarkPaidResponse,
  MarkPaidBody,
} from "@/lib/server/api-client";
import type { BillDetail, DiscountApply, TipApply, ProductionStatus } from "@/lib/types";

// All staff mutations return a result object (never throw) so the error detail
// from FastAPI can cross the server-action boundary and be shown in the UI.
// Pattern mirrors orders.ts SubmitResult.

export type StaffActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: e instanceof ApiError ? e.message : "Action failed, please try again",
  };
}
function unauth(): { ok: false; error: string } {
  return { ok: false, error: "Unauthorized" };
}


/** Advance or revert a production task's status (pending → preparing → completed, etc.). */
export async function setProductionStatus(
  taskId: number,
  status: ProductionStatus,
): Promise<StaffActionResult> {
  const s = await getSession();
  if (!s) return unauth();
  try {
    await api.setProductionStatus(taskId, status);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Mark all tasks on an order as picked up by the runner. Backend returns 409
 *  if any task is not yet completed — surface that as an error. */
export async function markPickedUp(orderId: number): Promise<StaffActionResult> {
  const s = await getSession();
  if (!s) return unauth();
  try {
    await api.markPickedUp(orderId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Update the quantity of an order item on an open bill. */
export async function updateOrderItemQty(
  itemId: number,
  qty: number,
): Promise<StaffActionResult> {
  const s = await getSession();
  if (!s) return unauth();
  try {
    await api.updateOrderItemQty(itemId, qty);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Delete an order item from an open bill. */
export async function deleteOrderItem(itemId: number): Promise<StaffActionResult> {
  const s = await getSession();
  if (!s) return unauth();
  try {
    await api.deleteOrderItem(itemId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ─── Payment actions ────────────────────────────────────────────────────────

export type StartCheckoutResult =
  | { ok: true; data: StartCheckoutResponse }
  | { ok: false; error: string };

/** Freeze the bill to "paying" status and return the bill_id + total. */
export async function startCheckout(
  tableCode: string,
): Promise<StartCheckoutResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.startCheckout(tableCode);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not start checkout",
    };
  }
}

export type CancelCheckoutResult =
  | { ok: true; data: CancelCheckoutResponse }
  | { ok: false; error: string };

/** Unfreeze a bill back to "open" when the customer cancelled Square payment. */
export async function cancelCheckout(
  tableCode: string,
): Promise<CancelCheckoutResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.cancelCheckout(tableCode);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not cancel checkout",
    };
  }
}

// ─── Discount actions (F15) ──────────────────────────────────────────────────

export type DiscountResult =
  | { ok: true; data: BillDetail | null }
  | { ok: false; error: string };

/**
 * Apply a percent or fixed discount to an open bill. Backend returns 422 for an
 * invalid value (e.g. percent out of 0–100) and 409 if the bill is not open —
 * those error details are surfaced verbatim for the UI.
 */
export async function applyDiscount(
  tableCode: string,
  body: DiscountApply,
): Promise<DiscountResult> {
  const s = await assertStaffAction();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.applyDiscount(tableCode, body);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not apply discount",
    };
  }
}

/** Remove any discount from an open bill. Backend returns 409 if not open. */
export async function removeDiscount(tableCode: string): Promise<DiscountResult> {
  const s = await assertStaffAction();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.removeDiscount(tableCode);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not remove discount",
    };
  }
}

// ─── Tip actions (F16) ───────────────────────────────────────────────────────

export type TipResult =
  | { ok: true; data: BillDetail | null }
  | { ok: false; error: string };

/**
 * Add a percent or fixed tip to an open bill. Backend returns 422 for an invalid
 * value (e.g. percent out of 0–100) and 409 if the bill is not open — those error
 * details are surfaced verbatim for the UI.
 */
export async function applyTip(
  tableCode: string,
  body: TipApply,
): Promise<TipResult> {
  const s = await assertStaffAction();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.applyTip(tableCode, body);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not apply tip",
    };
  }
}

/** Remove any tip from an open bill. Backend returns 409 if not open. */
export async function removeTip(tableCode: string): Promise<TipResult> {
  const s = await assertStaffAction();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.removeTip(tableCode);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not remove tip",
    };
  }
}

export type MarkPaidResult =
  | { ok: true; data: MarkPaidResponse }
  | { ok: false; error: string };

/** Mark a bill as paid. Pass body with provider_payment_id / amount /
 *  idempotency_key when coming from Square POS callback. */
export async function markPaid(
  tableCode: string,
  body?: MarkPaidBody,
): Promise<MarkPaidResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Unauthorized" };
  try {
    const data = await api.markPaid(tableCode, body);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Could not mark bill as paid",
    };
  }
}
