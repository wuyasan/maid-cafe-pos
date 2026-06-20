import type { Maid, SessionRead, StaffTable, StaffTablesResult } from "@/lib/types";

// Raw FastAPI wire shapes (what the backend actually returns). Normalized here so
// screens consume clean domain types. Keep in sync with backend pydantic schemas.

export interface CurrentSessionApi {
  // GET /sessions/current → CurrentSessionRead
  session: SessionRead | null;
}

export interface SessionMaidApi {
  // GET /session-maids?session_id= → list[SessionMaidAdminRead] (flattened, ALL maids)
  id: number;
  session_id: number;
  maid_id: number;
  is_available: boolean;
  maid_name: string;
  maid_photo_url: string | null;
}

/** /sessions/current wraps the session in an envelope — unwrap to the session or null. */
export function unwrapSession(raw: CurrentSessionApi | null): SessionRead | null {
  return raw?.session ?? null;
}

/** Keep only available maids and map flattened admin rows to the Maid domain shape. */
export function normalizeSessionMaids(rows: SessionMaidApi[]): Maid[] {
  return rows
    .filter((r) => r.is_available)
    .map((r) => ({
      id: r.maid_id,
      name: r.maid_name,
      photoUrl: r.maid_photo_url,
      isAvailable: r.is_available,
    }));
}

// ─── Staff table normalization ─────────────────────────────────────────────

/** Raw wire shape for GET /staff/tables — SessionTableSummary from Pydantic.
 *  open_bill_total arrives as a JSON number (Decimal serialized). */
export interface StaffTableApi {
  id: number;
  session_id: number;
  table_id: number;
  table_code: string;
  seats: number;
  is_shareable: boolean;
  status: string;
  current_party_size: number;
  layout_x: number;
  layout_y: number;
  layout_width: number;
  layout_height: number;
  layout_shape: string;
  open_bill_id: number | null;
  open_bill_total: number | string; // Pydantic Decimal → JSON number
}

export interface StaffTablesApi {
  session_id: number;
  session_name: string;
  tables: StaffTableApi[];
}

/**
 * Normalize the /staff/tables response:
 * - open_bill_total: coerce the JSON number (Decimal) to a fixed-2 string for
 *   consistent display (same pattern as BillDetail.total in customer flow).
 * - status / layout_shape: pass-through (backend enums serialize to string values
 *   that match our union literals).
 */
export function normalizeStaffTables(raw: StaffTablesApi): StaffTablesResult {
  return {
    session_id: raw.session_id,
    session_name: raw.session_name,
    tables: raw.tables.map((t) => normalizeStaffTable(t)),
  };
}

export function normalizeStaffTable(t: StaffTableApi): StaffTable {
  return {
    id: t.id,
    session_id: t.session_id,
    table_id: t.table_id,
    table_code: t.table_code,
    seats: t.seats,
    is_shareable: t.is_shareable,
    status: t.status as StaffTable["status"],
    current_party_size: t.current_party_size,
    layout_x: t.layout_x,
    layout_y: t.layout_y,
    layout_width: t.layout_width,
    layout_height: t.layout_height,
    layout_shape: t.layout_shape as StaffTable["layout_shape"],
    open_bill_id: t.open_bill_id,
    open_bill_total: Number(t.open_bill_total).toFixed(2),
  };
}
