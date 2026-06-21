"use server";
import { getSession, assertAdminAction } from "@/lib/server/auth";
import { revalidateTag } from "next/cache";
import { ApiError, api, currentActor } from "@/lib/server/api-client";
import type {
  SessionCreate,
  SessionRead,
  SessionUpdate,
  CategoryAdmin,
  CategoryCreate,
  CategoryUpdate,
  MenuItemAdmin,
  MenuItemWithPricingCreate,
  MenuItemWithPricingUpdate,
  MaidAdmin,
  MaidCreate,
  MaidUpdate,
  MaidServicePricing,
  MaidServicePricingCreate,
  MaidServicePricingUpdate,
  TableRead,
  TableCreate,
  TableUpdate,
  SessionTableAdminSummary,
  SessionTableCreate,
  SessionTableUpdate,
  SessionTableAddParty,
  SessionMaidAdminRead,
  StaffUserAdmin,
  StaffUserCreate,
  StaffUserUpdate,
} from "@/lib/types";

// All admin mutations return a result object (never throw) so error details from
// FastAPI can cross the server-action boundary and be shown in the UI.
// Pattern mirrors staff.ts.

export type AdminActionResult = { ok: true } | { ok: false; error: string };
export type AdminSessionResult = { ok: true; data: SessionRead } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: e instanceof ApiError ? e.message : "Action failed, please try again",
  };
}

function unauth(): { ok: false; error: string } {
  return { ok: false, error: "Unauthorized" };
}

/** Create a new session. */
export async function createSession(body: SessionCreate): Promise<AdminSessionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createSession(body);
    revalidateTag("sessions", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionResult;
  }
}

/** Update an existing session's fields. */
export async function updateSession(
  sessionId: number,
  body: SessionUpdate,
): Promise<AdminSessionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateSession(sessionId, body);
    revalidateTag("sessions", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionResult;
  }
}

/** Delete a session by ID. */
export async function deleteSession(sessionId: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteSession(sessionId);
    revalidateTag("sessions", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Make a session the current (active) session. */
export async function setCurrentSession(sessionId: number): Promise<AdminSessionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.setCurrentSession(sessionId);
    revalidateTag("sessions", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionResult;
  }
}

/** Revert a session back to scheduled status. */
export async function setSessionScheduled(sessionId: number): Promise<AdminSessionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.setSessionScheduled(sessionId);
    revalidateTag("sessions", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionResult;
  }
}

/** Close a session. */
export async function setSessionClosed(sessionId: number): Promise<AdminSessionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.setSessionClosed(sessionId);
    revalidateTag("sessions", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionResult;
  }
}

export type AdminCategoryResult = { ok: true; data: CategoryAdmin } | { ok: false; error: string };
export type AdminMenuItemResult = { ok: true; data: MenuItemAdmin } | { ok: false; error: string };
export type AdminMaidResult = { ok: true; data: MaidAdmin } | { ok: false; error: string };
export type AdminMaidServicePricingResult = { ok: true; data: MaidServicePricing } | { ok: false; error: string };

// ── Categories ────────────────────────────────────────────────────────────────

export async function createCategory(body: CategoryCreate): Promise<AdminCategoryResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createCategory(body);
    revalidateTag("menu", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminCategoryResult;
  }
}

export async function updateCategory(id: number, body: CategoryUpdate): Promise<AdminCategoryResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateCategory(id, body);
    revalidateTag("menu", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminCategoryResult;
  }
}

export async function deleteCategory(id: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteCategory(id);
    revalidateTag("menu", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Menu items ─────────────────────────────────────────────────────────────────

export async function createMenuItem(body: MenuItemWithPricingCreate): Promise<AdminMenuItemResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createMenuItemWithPricing(body);
    revalidateTag("menu", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminMenuItemResult;
  }
}

export async function updateMenuItem(id: number, body: MenuItemWithPricingUpdate): Promise<AdminMenuItemResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateMenuItemWithPricing(id, body);
    revalidateTag("menu", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminMenuItemResult;
  }
}

export async function deleteMenuItem(id: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteMenuItem(id);
    revalidateTag("menu", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Maids ──────────────────────────────────────────────────────────────────────

export async function createMaid(body: MaidCreate): Promise<AdminMaidResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createMaid(body);
    revalidateTag("maids", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminMaidResult;
  }
}

export async function updateMaid(id: number, body: MaidUpdate): Promise<AdminMaidResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateMaid(id, body);
    revalidateTag("maids", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminMaidResult;
  }
}

export async function deleteMaid(id: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteMaid(id);
    revalidateTag("maids", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Maid service pricing ───────────────────────────────────────────────────────

export async function createMaidServicePricing(body: MaidServicePricingCreate): Promise<AdminMaidServicePricingResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createMaidServicePricing(body);
    revalidateTag("menu", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminMaidServicePricingResult;
  }
}

export async function updateMaidServicePricing(id: number, body: MaidServicePricingUpdate): Promise<AdminMaidServicePricingResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateMaidServicePricing(id, body);
    revalidateTag("menu", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminMaidServicePricingResult;
  }
}

export async function deleteMaidServicePricing(id: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteMaidServicePricing(id);
    revalidateTag("menu", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Tables (master data) ───────────────────────────────────────────────────────

export type AdminTableResult = { ok: true; data: TableRead } | { ok: false; error: string };

export async function createTable(body: TableCreate): Promise<AdminTableResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createTable(body);
    revalidateTag("tables", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminTableResult;
  }
}

export async function updateTable(id: number, body: TableUpdate): Promise<AdminTableResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateTable(id, body);
    revalidateTag("tables", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminTableResult;
  }
}

export async function deleteTable(id: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteTable(id);
    revalidateTag("tables", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Session-Tables ─────────────────────────────────────────────────────────────

export type AdminSessionTableResult = { ok: true; data: SessionTableAdminSummary } | { ok: false; error: string };
export type AdminSessionTablesResult = { ok: true; data: SessionTableAdminSummary[] } | { ok: false; error: string };

export async function createSessionTable(body: SessionTableCreate): Promise<AdminSessionTableResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.createSessionTable(body);
    revalidateTag("tables", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionTableResult;
  }
}

export async function syncActiveSessionTables(sessionId: number): Promise<AdminSessionTablesResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.syncActiveSessionTables(sessionId);
    revalidateTag("tables", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionTablesResult;
  }
}

export async function updateSessionTable(id: number, body: SessionTableUpdate): Promise<AdminSessionTableResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.updateSessionTable(id, body);
    revalidateTag("tables", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionTableResult;
  }
}

export async function addPartyToSessionTable(id: number, body: SessionTableAddParty): Promise<AdminSessionTableResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.addPartyToSessionTable(id, body);
    revalidateTag("tables", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionTableResult;
  }
}

export async function deleteSessionTable(id: number): Promise<AdminActionResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    await api.deleteSessionTable(id);
    revalidateTag("tables", "max");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Session-Maids ──────────────────────────────────────────────────────────────

export type AdminSessionMaidResult = { ok: true; data: SessionMaidAdminRead } | { ok: false; error: string };

export async function setSessionMaidAvailability(
  sessionId: number,
  maidId: number,
  isAvailable: boolean,
): Promise<AdminSessionMaidResult> {
  const s = await getSession();
  if (!s || s.role !== "admin") return unauth();
  try {
    const data = await api.setSessionMaidAvailability(sessionId, maidId, isAvailable);
    revalidateTag("maids", "max");
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminSessionMaidResult;
  }
}

// ── Staff users (account system, F1) ────────────────────────────────────────────

export type AdminStaffUserResult =
  | { ok: true; data: StaffUserAdmin }
  | { ok: false; error: string };
export type AdminStaffUsersResult =
  | { ok: true; data: StaffUserAdmin[] }
  | { ok: false; error: string };

/** List all staff users. Admin only. */
export async function listStaffUsers(): Promise<AdminStaffUsersResult> {
  if (!(await assertAdminAction())) return unauth();
  try {
    const data = await api.getStaffUsers();
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminStaffUsersResult;
  }
}

/** Create a staff user. Admin only. */
export async function createStaffUser(body: StaffUserCreate): Promise<AdminStaffUserResult> {
  if (!(await assertAdminAction())) return unauth();
  try {
    const data = await api.createStaffUser(body, await currentActor());
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminStaffUserResult;
  }
}

/** Update a staff user's display name / role. Admin only. */
export async function updateStaffUser(
  id: number,
  body: StaffUserUpdate,
): Promise<AdminStaffUserResult> {
  if (!(await assertAdminAction())) return unauth();
  try {
    const data = await api.updateStaffUser(id, body, await currentActor());
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminStaffUserResult;
  }
}

/** Enable / disable a staff user. Admin only. */
export async function setStaffUserActive(
  id: number,
  isActive: boolean,
): Promise<AdminStaffUserResult> {
  if (!(await assertAdminAction())) return unauth();
  try {
    const data = await api.updateStaffUser(id, { is_active: isActive }, await currentActor());
    return { ok: true, data };
  } catch (e) {
    return fail(e) as AdminStaffUserResult;
  }
}

/** Reset a staff user's PIN. Admin only. */
export async function resetStaffUserPin(id: number, pin: string): Promise<AdminActionResult> {
  if (!(await assertAdminAction())) return unauth();
  try {
    await api.resetStaffUserPin(id, pin, await currentActor());
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
