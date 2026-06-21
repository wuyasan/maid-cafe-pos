import { describe, it, expect } from "vitest";
import {
  normalizeBill,
  normalizeSessionMaids,
  normalizeStaffTable,
  normalizeStaffTables,
  unwrapSession,
} from "./normalize";
import type { BillDetail } from "./types";

describe("unwrapSession", () => {
  it("unwraps the { session } envelope (real /sessions/current shape)", () => {
    const session = {
      id: 7,
      name: "Tonight",
      service_date: "2025-01-01",
      start_time: null,
      end_time: null,
      kitchen_last_order_time: null,
      bar_last_order_time: null,
      status: "active" as const,
      created_at: "2025-01-01T00:00:00Z",
    };
    const raw = { session };
    expect(unwrapSession(raw)).toEqual(session);
  });
  it("returns null when there is no active session", () => {
    expect(unwrapSession({ session: null })).toBeNull();
    expect(unwrapSession(null)).toBeNull();
  });
});

describe("normalizeSessionMaids", () => {
  // Real flattened /session-maids admin rows.
  const rows = [
    { id: 1, session_id: 7, maid_id: 10, is_available: true, maid_name: "Yui", maid_photo_url: "/y.jpg" },
    { id: 2, session_id: 7, maid_id: 11, is_available: false, maid_name: "Rin", maid_photo_url: null },
  ];
  it("maps flattened admin rows to the Maid domain shape (maid_id/maid_name)", () => {
    expect(normalizeSessionMaids([rows[0]])).toEqual([
      { id: 10, name: "Yui", photoUrl: "/y.jpg", isAvailable: true },
    ]);
  });
  it("filters out unavailable maids (backend does not)", () => {
    expect(normalizeSessionMaids(rows).map((m) => m.id)).toEqual([10]);
  });
});

// ─── Bill normalization (F15 discount) ─────────────────────────────────────

describe("normalizeBill", () => {
  const fullBill: BillDetail = {
    id: 1,
    status: "open",
    subtotal: "20.00",
    discount_type: "percent",
    discount_value: "10",
    discount_amount: "2.00",
    discount_note: "regular",
    tax: "0.00",
    service_charge: "0.00",
    total: "18.00",
    items: [],
  };

  it("passes through a fully-populated discounted bill", () => {
    const out = normalizeBill(fullBill)!;
    expect(out.discount_type).toBe("percent");
    expect(out.discount_value).toBe("10");
    expect(out.discount_amount).toBe("2.00");
    expect(out.discount_note).toBe("regular");
    expect(out.total).toBe("18.00");
  });

  it("returns null when the bill is null", () => {
    expect(normalizeBill(null)).toBeNull();
  });

  it("defaults missing discount fields to a no-discount shape", () => {
    // Simulate a backend response without discount fields at all.
    const raw = {
      id: 2,
      status: "open",
      subtotal: "15.00",
      total: "15.00",
      tax: "0.00",
      service_charge: "0.00",
      items: [],
    } as unknown as BillDetail;
    const out = normalizeBill(raw)!;
    expect(out.discount_type).toBe("none");
    expect(out.discount_value).toBe("0");
    expect(out.discount_amount).toBe("0.00");
    expect(out.discount_note).toBeNull();
    expect(out.subtotal).toBe("15.00");
    expect(out.total).toBe("15.00");
  });

  it("coerces an unknown/invalid discount_type to 'none'", () => {
    const raw = { ...fullBill, discount_type: "weird" as unknown as BillDetail["discount_type"] };
    expect(normalizeBill(raw)!.discount_type).toBe("none");
  });

  it("coerces numeric amounts to fixed-2 strings", () => {
    const raw = {
      ...fullBill,
      discount_amount: 2 as unknown as string,
      total: 18 as unknown as string,
      subtotal: 20 as unknown as string,
    };
    const out = normalizeBill(raw)!;
    expect(out.discount_amount).toBe("2.00");
    expect(out.total).toBe("18.00");
    expect(out.subtotal).toBe("20.00");
  });
});

// ─── Staff table normalization ─────────────────────────────────────────────

const tableApiRow = {
  id: 5,
  session_id: 3,
  table_id: 2,
  table_code: "A1",
  seats: 4,
  is_shareable: false,
  status: "occupied",
  current_party_size: 2,
  layout_x: 10,
  layout_y: 20,
  layout_width: 16,
  layout_height: 18,
  layout_shape: "rectangle",
  open_bill_id: 42,
  open_bill_total: 38, // JSON number — Pydantic Decimal → JSON
};

describe("normalizeStaffTable", () => {
  it("converts open_bill_total from number to fixed-2 string", () => {
    const result = normalizeStaffTable(tableApiRow);
    expect(result.open_bill_total).toBe("38.00");
  });

  it("passes through status and layout_shape as-is", () => {
    const result = normalizeStaffTable(tableApiRow);
    expect(result.status).toBe("occupied");
    expect(result.layout_shape).toBe("rectangle");
  });

  it("preserves open_bill_id correctly", () => {
    const result = normalizeStaffTable(tableApiRow);
    expect(result.open_bill_id).toBe(42);
  });

  it("handles open_bill_total = 0 (no open bill, backend returns 0.00)", () => {
    const row = { ...tableApiRow, open_bill_id: null, open_bill_total: 0 };
    const result = normalizeStaffTable(row);
    expect(result.open_bill_total).toBe("0.00");
  });

  it("handles open_bill_total as a string (Pydantic may serialize Decimal as string)", () => {
    const row = { ...tableApiRow, open_bill_total: "12.50" };
    const result = normalizeStaffTable(row);
    expect(result.open_bill_total).toBe("12.50");
  });
});

describe("normalizeStaffTables", () => {
  it("maps all tables and preserves envelope fields", () => {
    const raw = {
      session_id: 3,
      session_name: "Friday Night",
      tables: [tableApiRow],
    };
    const result = normalizeStaffTables(raw);
    expect(result.session_id).toBe(3);
    expect(result.session_name).toBe("Friday Night");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].table_code).toBe("A1");
  });

  it("returns an empty tables array when there are no tables", () => {
    const raw = { session_id: 1, session_name: "Empty", tables: [] };
    expect(normalizeStaffTables(raw).tables).toHaveLength(0);
  });
});
