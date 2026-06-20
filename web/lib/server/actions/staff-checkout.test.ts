/**
 * Tests for Fix #1: startCheckout returns checkout_total from the server
 * and Fix #2: cancelCheckout action exists and proxies the API call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only ─────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock api-client ──────────────────────────────────────────────────────────
const mockStartCheckout = vi.fn();
const mockCancelCheckout = vi.fn();
const mockMarkPaid = vi.fn();

vi.mock("@/lib/server/api-client", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
  api: {
    startCheckout: (...args: unknown[]) => mockStartCheckout(...args),
    cancelCheckout: (...args: unknown[]) => mockCancelCheckout(...args),
    markPaid: (...args: unknown[]) => mockMarkPaid(...args),
    setProductionStatus: vi.fn(),
    markPickedUp: vi.fn(),
    updateOrderItemQty: vi.fn(),
    deleteOrderItem: vi.fn(),
  },
}));

// ── Mock auth ─────────────────────────────────────────────────────────────────
const mockGetSession = vi.fn();
vi.mock("@/lib/server/auth", () => ({
  getSession: () => mockGetSession(),
}));

import { startCheckout, cancelCheckout } from "./staff";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated session
  mockGetSession.mockResolvedValue({ role: "staff", name: "Alice", iat: 0, exp: 9999999999 });
});

describe("startCheckout action — Fix #1 checkout_total", () => {
  it("returns ok:true with data including checkout_total when backend succeeds", async () => {
    const serverResponse = {
      success: true,
      table_code: "T1",
      bill_id: 42,
      bill_status: "paying",
      session_table_status: "paying",
      checkout_total: "25.50",
    };
    mockStartCheckout.mockResolvedValue(serverResponse);

    const result = await startCheckout("T1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.checkout_total).toBe("25.50");
      expect(result.data.bill_id).toBe(42);
    }
  });

  it("returns ok:false when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await startCheckout("T1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unauthorized/i);
    }
    expect(mockStartCheckout).not.toHaveBeenCalled();
  });

  it("surfaces API error message on failure", async () => {
    const { ApiError } = await import("@/lib/server/api-client");
    mockStartCheckout.mockRejectedValue(new ApiError(409, "Bill already paying"));

    const result = await startCheckout("T1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Bill already paying");
    }
  });
});

describe("cancelCheckout action — Fix #2", () => {
  it("returns ok:true with data when backend succeeds", async () => {
    const serverResponse = {
      success: true,
      table_code: "T1",
      bill_id: 42,
      bill_status: "open",
      session_table_status: "occupied",
    };
    mockCancelCheckout.mockResolvedValue(serverResponse);

    const result = await cancelCheckout("T1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bill_status).toBe("open");
      expect(result.data.table_code).toBe("T1");
    }
  });

  it("returns ok:false when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await cancelCheckout("T1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unauthorized/i);
    }
    expect(mockCancelCheckout).not.toHaveBeenCalled();
  });

  it("surfaces API error on 409 (bill not in paying state)", async () => {
    const { ApiError } = await import("@/lib/server/api-client");
    mockCancelCheckout.mockRejectedValue(new ApiError(409, "Bill is not in paying state"));

    const result = await cancelCheckout("T1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Bill is not in paying state");
    }
  });

  it("calls the API with the correct table code", async () => {
    mockCancelCheckout.mockResolvedValue({
      success: true,
      table_code: "A5",
      bill_id: 7,
      bill_status: "open",
      session_table_status: "occupied",
    });

    await cancelCheckout("A5");

    expect(mockCancelCheckout).toHaveBeenCalledWith("A5");
  });
});
