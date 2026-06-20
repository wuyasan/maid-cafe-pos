import "server-only";
import type {
  BillDetail,
  Category,
  CategoryAdmin,
  CategoryCreate,
  CategoryUpdate,
  Maid,
  MaidAdmin,
  MaidCreate,
  MaidServicePricing,
  MaidServicePricingCreate,
  MaidServicePricingUpdate,
  MaidUpdate,
  MenuItemAdmin,
  MenuItemWithPricingCreate,
  MenuItemWithPricingUpdate,
  MenuItem,
  OrderPayload,
  OrderResponse,
  ProductionQueueResult,
  PickupOrdersResult,
  SessionCreate,
  SessionRead,
  SessionSummaryResponse,
  SessionUpdate,
  StaffTablesResult,
  TableRead,
  TableCreate,
  TableUpdate,
  SessionTableAdminSummary,
  SessionTableCreate,
  SessionTableUpdate,
  SessionTableAddParty,
  SessionMaidAdminRead,
} from "@/lib/types";

// ─── Checkout / payment shapes ─────────────────────────────────────────────
export interface StartCheckoutResponse {
  success: boolean;
  table_code: string;
  bill_id: number;
  bill_status: string;
  session_table_status: string;
  checkout_total: string; // authoritative server-side decimal snapshot, e.g. "12.50"
}

export interface CancelCheckoutResponse {
  success: boolean;
  table_code: string;
  bill_id: number;
  bill_status: string;
  session_table_status: string;
}

export interface MarkPaidBody {
  provider_payment_id?: string;
  amount?: string; // decimal string, e.g. "12.50"
  idempotency_key?: string;
  manual?: boolean; // explicit staff cash/override — skips Square verification
}

export interface MarkPaidResponse {
  success: boolean;
  idempotent: boolean;
  table_code: string;
  bill_id: number;
  bill_status: string;
  session_table_status: string;
  current_party_size: number;
  closed_at: string | null;
  payment_id: number;
}
import {
  normalizeSessionMaids,
  normalizeStaffTables,
  unwrapSession,
  type CurrentSessionApi,
  type SessionMaidApi,
  type StaffTablesApi,
} from "@/lib/normalize";

// BFF core: the ONLY place that talks to FastAPI. Browser never calls FastAPI directly.
// In prod, INTERNAL_GATEWAY_TOKEN is set on both sides so FastAPI only trusts this server.
const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
// Treat blank / whitespace-only values as "not configured" (matches backend behaviour).
const TOKEN = process.env.INTERNAL_GATEWAY_TOKEN?.trim() || undefined;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function authHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("content-type", "application/json");
  if (TOKEN) h.set("x-internal-token", TOKEN);
  return h;
}

// Semi-static reads use a short revalidate window: during Phase 1 the OLD staff-web
// admin still writes FastAPI directly and never triggers Next's revalidateTag, so a
// 30s TTL bounds staleness. Tags stay so we can switch to pure tag-invalidation once
// the new admin (Phase 4) routes its writes through this BFF.
async function getJson<T>(
  path: string,
  opts: { tags?: string[]; revalidate?: number } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    next: { tags: opts.tags, revalidate: opts.revalidate ?? 30 },
  });
  return handle<T>(res);
}

async function getLive<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), cache: "no-store" });
  return handle<T>(res);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return handle<T>(res);
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return handle<T>(res);
}

async function deleteReq<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
    cache: "no-store",
  });
  return handle<T>(res);
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return handle<T>(res);
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail =
        body && typeof body === "object" && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : JSON.stringify(body);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  // Semi-static (short revalidate + tags)
  getCurrentSession: (): Promise<SessionRead | null> =>
    getJson<CurrentSessionApi>("/sessions/current", { tags: ["session"] }).then(unwrapSession),
  getMenuItems: () => getJson<MenuItem[]>("/menu/items", { tags: ["menu"] }),
  getCategories: () => getJson<Category[]>("/menu/categories", { tags: ["menu"] }),
  getSessionMaids: (sessionId: number): Promise<Maid[]> =>
    getJson<SessionMaidApi[]>(`/session-maids?session_id=${sessionId}`, {
      tags: ["maids", `session:${sessionId}`],
    }).then(normalizeSessionMaids),

  // Live (never cached)
  getTableBill: (tableCode: string) =>
    getLive<BillDetail | null>(`/customer-orders/customer/table/${tableCode}/bill`),

  // Staff live reads (no-store — polled by kitchen/runner/floor screens)
  getStaffTables: (): Promise<StaffTablesResult> =>
    getLive<StaffTablesApi>("/staff/tables").then(normalizeStaffTables),

  getProductionQueue: (station: "kitchen" | "bar"): Promise<ProductionQueueResult> =>
    getLive<ProductionQueueResult>(`/staff/production/${station}`),

  getPickupOrders: (): Promise<PickupOrdersResult> =>
    getLive<PickupOrdersResult>("/staff/production/pickup/orders"),

  // Staff mutations
  setProductionStatus: (taskId: number, status: string) =>
    patchJson<unknown>(`/staff/production/tasks/${taskId}/status`, { production_status: status }),

  markPickedUp: (orderId: number) =>
    postJson<unknown>(`/staff/production/pickup/orders/${orderId}`, {}),

  updateOrderItemQty: (itemId: number, qty: number) =>
    patchJson<unknown>(`/staff/order-items/${itemId}/quantity`, { quantity: qty }),

  deleteOrderItem: (itemId: number) =>
    deleteReq<unknown>(`/staff/order-items/${itemId}`),

  // Customer mutations
  submitOrder: (tableCode: string, payload: OrderPayload) =>
    postJson<OrderResponse>(`/customer-orders/customer/table/${tableCode}/orders`, payload),

  // Checkout / payment
  startCheckout: (tableCode: string) =>
    postJson<StartCheckoutResponse>(`/staff/table/${encodeURIComponent(tableCode)}/start-checkout`, {}),

  cancelCheckout: (tableCode: string) =>
    postJson<CancelCheckoutResponse>(`/staff/table/${encodeURIComponent(tableCode)}/cancel-checkout`, {}),

  markPaid: (tableCode: string, body?: MarkPaidBody) =>
    postJson<MarkPaidResponse>(
      `/staff/table/${encodeURIComponent(tableCode)}/mark-paid`,
      body ?? {},
    ),

  // Admin session reads (no-store — admin needs immediate consistency)
  getSessions: () => getLive<SessionRead[]>("/sessions"),
  getSessionSummary: (sessionId: number) =>
    getLive<SessionSummaryResponse>(`/staff/session-summary/${sessionId}`),

  // Admin session writes
  createSession: (body: SessionCreate) => postJson<SessionRead>("/sessions", body),
  updateSession: (sessionId: number, body: SessionUpdate) =>
    patchJson<SessionRead>(`/sessions/${sessionId}`, body),
  deleteSession: (sessionId: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/sessions/${sessionId}`),
  setCurrentSession: (sessionId: number) =>
    postJson<SessionRead>(`/sessions/${sessionId}/set-current`, {}),
  setSessionScheduled: (sessionId: number) =>
    postJson<SessionRead>(`/sessions/${sessionId}/set-scheduled`, {}),
  setSessionClosed: (sessionId: number) =>
    postJson<SessionRead>(`/sessions/${sessionId}/set-closed`, {}),

  // ── Admin: Categories ────────────────────────────────────────────────────────
  getAdminCategories: () => getLive<CategoryAdmin[]>("/menu/categories"),
  createCategory: (body: CategoryCreate) =>
    postJson<CategoryAdmin>("/menu/categories", body),
  updateCategory: (id: number, body: CategoryUpdate) =>
    patchJson<CategoryAdmin>(`/menu/categories/${id}`, body),
  deleteCategory: (id: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/menu/categories/${id}`),

  // ── Admin: Menu items ────────────────────────────────────────────────────────
  getAdminMenuItems: () => getLive<MenuItemAdmin[]>("/menu/items"),
  createMenuItemWithPricing: (body: MenuItemWithPricingCreate) =>
    postJson<MenuItemAdmin>("/menu/items-with-pricing", body),
  updateMenuItemWithPricing: (id: number, body: MenuItemWithPricingUpdate) =>
    patchJson<MenuItemAdmin>(`/menu/items-with-pricing/${id}`, body),
  deleteMenuItem: (id: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/menu/items/${id}`),

  // ── Admin: Maid service pricing ──────────────────────────────────────────────
  getMaidServicePricingList: () => getLive<MaidServicePricing[]>("/menu/maid-service-pricing"),
  createMaidServicePricing: (body: MaidServicePricingCreate) =>
    postJson<MaidServicePricing>("/menu/maid-service-pricing", body),
  updateMaidServicePricing: (id: number, body: MaidServicePricingUpdate) =>
    patchJson<MaidServicePricing>(`/menu/maid-service-pricing/${id}`, body),
  deleteMaidServicePricing: (id: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/menu/maid-service-pricing/${id}`),

  // ── Admin: Maids ──────────────────────────────────────────────────────────────
  getAdminMaids: () => getLive<MaidAdmin[]>("/maids/"),
  createMaid: (body: MaidCreate) =>
    postJson<MaidAdmin>("/maids/", body),
  updateMaid: (id: number, body: MaidUpdate) =>
    patchJson<MaidAdmin>(`/maids/${id}`, body),
  deleteMaid: (id: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/maids/${id}`),

  // ── Admin: Tables (master data) ──────────────────────────────────────────────
  getAdminTables: () => getLive<TableRead[]>("/tables/"),
  createTable: (body: TableCreate) =>
    postJson<TableRead>("/tables/", body),
  updateTable: (id: number, body: TableUpdate) =>
    patchJson<TableRead>(`/tables/${id}`, body),
  deleteTable: (id: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/tables/${id}`),

  // ── Admin: Session-Tables ────────────────────────────────────────────────────
  getSessionTables: (sessionId: number) =>
    getLive<SessionTableAdminSummary[]>(`/tables/session-tables?session_id=${sessionId}`),
  createSessionTable: (body: SessionTableCreate) =>
    postJson<SessionTableAdminSummary>("/tables/session-tables", body),
  syncActiveSessionTables: (sessionId: number) =>
    postJson<SessionTableAdminSummary[]>(`/tables/session-tables/sync-active?session_id=${sessionId}`, {}),
  updateSessionTable: (id: number, body: SessionTableUpdate) =>
    patchJson<SessionTableAdminSummary>(`/tables/session-tables/${id}`, body),
  addPartyToSessionTable: (id: number, body: SessionTableAddParty) =>
    postJson<SessionTableAdminSummary>(`/tables/session-tables/${id}/add-party`, body),
  deleteSessionTable: (id: number) =>
    deleteReq<{ success: boolean; deleted_id: number }>(`/tables/session-tables/${id}`),

  // ── Admin: Session-Maids ─────────────────────────────────────────────────────
  getAdminSessionMaids: (sessionId: number) =>
    getLive<SessionMaidAdminRead[]>(`/session-maids/?session_id=${sessionId}`),
  setSessionMaidAvailability: (sessionId: number, maidId: number, isAvailable: boolean) =>
    putJson<SessionMaidAdminRead>(
      `/session-maids/session/${sessionId}/maid/${maidId}/availability?is_available=${isAvailable}`,
      {},
    ),
};
