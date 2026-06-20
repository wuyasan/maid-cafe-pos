"use server";
import { ApiError, api } from "@/lib/server/api-client";
import { getSession } from "@/lib/server/auth";
import type { OrderPayload, OrderResponse } from "@/lib/types";

// Return a result (not throw) so the backend's error detail (closed station,
// unavailable maid, gateway 401, validation 400) crosses the action boundary
// and the client can show it.
export type SubmitResult =
  | { ok: true; data: OrderResponse }
  | { ok: false; error: string };

export async function submitOrderAction(
  tableCode: string,
  payload: OrderPayload,
): Promise<SubmitResult> {
  // Guard: source="staff" can only be set by an authenticated staff/admin session.
  // If the caller claims source="staff" without a valid session, downgrade to "qr"
  // so unauthenticated customers can never forge staff-sourced orders.
  let safePayload = payload;
  if (payload.source === "staff") {
    const session = await getSession();
    if (!session) {
      safePayload = { ...payload, source: "qr" };
    }
  }

  try {
    const data = await api.submitOrder(tableCode, safePayload);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : "Order failed, please try again",
    };
  }
}
