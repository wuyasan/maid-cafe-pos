/**
 * Tests for submitOrderAction source-field guard (Fix #3).
 *
 * We mock the "use server" dependencies that require a real Next.js runtime
 * (cookies, server-only, etc.) so we can unit-test the pure logic in Node/jsdom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only (no-op in tests) ──────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock api-client ─────────────────────────────────────────────────────────
const mockSubmitOrder = vi.fn();
vi.mock("@/lib/server/api-client", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
  api: {
    submitOrder: (...args: unknown[]) => mockSubmitOrder(...args),
  },
}));

// ── Mock auth ────────────────────────────────────────────────────────────────
const mockGetSession = vi.fn();
vi.mock("@/lib/server/auth", () => ({
  getSession: () => mockGetSession(),
}));

// Import AFTER mocks are set up
import { submitOrderAction } from "./orders";
import type { OrderPayload } from "@/lib/types";

function makePayload(source: "qr" | "staff"): OrderPayload {
  return {
    source,
    items: [{ menu_item_id: 1, quantity: 1, selected_maid_ids: [], notes: "" }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmitOrder.mockResolvedValue({ order_id: 1, items: [] });
});

describe("submitOrderAction — source guard (Fix #3)", () => {
  it("passes source='qr' through unchanged regardless of session", async () => {
    mockGetSession.mockResolvedValue(null);
    const payload = makePayload("qr");

    const result = await submitOrderAction("T1", payload);

    expect(result.ok).toBe(true);
    // getSession is never called for source="qr"
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSubmitOrder).toHaveBeenCalledWith("T1", expect.objectContaining({ source: "qr" }));
  });

  it("downgrades source='staff' to 'qr' when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const payload = makePayload("staff");

    const result = await submitOrderAction("T1", payload);

    expect(result.ok).toBe(true);
    expect(mockGetSession).toHaveBeenCalledOnce();
    // The api must receive source="qr", not "staff"
    expect(mockSubmitOrder).toHaveBeenCalledWith(
      "T1",
      expect.objectContaining({ source: "qr" }),
    );
  });

  it("keeps source='staff' when the session is valid", async () => {
    mockGetSession.mockResolvedValue({ role: "staff", name: "Alice", iat: 0, exp: 9999999999 });
    const payload = makePayload("staff");

    const result = await submitOrderAction("T1", payload);

    expect(result.ok).toBe(true);
    expect(mockGetSession).toHaveBeenCalledOnce();
    // The api must receive source="staff" intact
    expect(mockSubmitOrder).toHaveBeenCalledWith(
      "T1",
      expect.objectContaining({ source: "staff" }),
    );
  });

  it("returns ok:false and surfaces the error message on api failure", async () => {
    mockGetSession.mockResolvedValue(null);
    mockSubmitOrder.mockRejectedValue(new Error("Backend error"));

    const result = await submitOrderAction("T1", makePayload("qr"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Order failed/);
    }
  });

  it("does not mutate the original payload object when downgrading", async () => {
    mockGetSession.mockResolvedValue(null);
    const payload = makePayload("staff");
    const originalSource = payload.source;

    await submitOrderAction("T1", payload);

    // Original payload must be untouched (spread, not mutation)
    expect(payload.source).toBe(originalSource);
  });
});
