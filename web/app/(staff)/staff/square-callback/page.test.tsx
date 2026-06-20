/**
 * Tests for the Square callback cancelled branch.
 *
 * Verifies that on a Square cancel signal:
 *  1. cancelCheckout() is called with the pending table code.
 *  2. clearPendingCheckout() is called (stale pending is removed).
 *  3. No "Re-launch Square" control is rendered.
 *  4. Only "Return to Table" link is shown.
 *  5. Graceful fallback when cancelCheckout itself fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Mock next-intl ───────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const msgs: Record<string, string> = {
      "payment.processingTitle": "Processing Payment",
      "payment.processingHint": "Confirming Square payment…",
      "payment.successTitle": "Payment Complete",
      "payment.errorTitle": "Payment Needs Review",
      "payment.cancelledTitle": "Payment Cancelled",
      "payment.cancelledHint": "Payment was cancelled. Return to the table to start a new checkout.",
      "payment.cancelledBillRestored": "Checkout cancelled — bill reopened. Return to the table to start a new checkout.",
      "payment.returnToTable": "Return to Table",
      "payment.relaunchSquare": "Re-launch Square",
      "payment.noPending": "No pending checkout found.",
      "payment.squareFailed": "Square payment failed.",
      "payment.squareError": "Square error: {code}",
      "payment.markPaidFailed": "Could not mark bill as paid.",
      "payment.errorCode": "Error code:",
      "payment.manualMarkPaid": "Manual Mark Paid",
      "payment.floorMap": "Floor Map",
      "payment.returnToFloor": "Return to Table",
      "payment.txnId": "Transaction ID:",
      "payment.recordedHint": "Payment recorded.",
    };
    return msgs[`${ns}.${key}`] ?? key;
  },
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("data=" + encodeURIComponent(JSON.stringify({ status: "cancel" }))),
  usePathname: () => "/staff/square-callback",
}));

// ── Mock squarePos ────────────────────────────────────────────────────────────
const mockClearPendingCheckout = vi.fn();
const mockReadPendingCheckout = vi.fn();

vi.mock("@/lib/squarePos", () => ({
  readPendingCheckout: () => mockReadPendingCheckout(),
  clearPendingCheckout: () => mockClearPendingCheckout(),
  savePendingCheckout: vi.fn(),
  buildSquarePosUrl: vi.fn().mockReturnValue("square-commerce-v1://payment/create?data=test"),
}));

// ── Mock staff server actions ─────────────────────────────────────────────────
const mockCancelCheckout = vi.fn();
const mockMarkPaid = vi.fn();

vi.mock("@/lib/server/actions/staff", () => ({
  cancelCheckout: (...args: unknown[]) => mockCancelCheckout(...args),
  markPaid: (...args: unknown[]) => mockMarkPaid(...args),
}));

// ── Default pending checkout ──────────────────────────────────────────────────
const PENDING = {
  tableCode: "T3",
  billId: 99,
  total: "42.00",
  createdAt: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderCallbackPage() {
  // Dynamic import so mocks are in place before the module loads.
  const { default: SquareCallbackPage } = await import("./page");
  render(<SquareCallbackPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SquareCallbackPage — cancelled branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPendingCheckout.mockReturnValue(PENDING);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls cancelCheckout with the pending tableCode", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: true, data: { bill_status: "open", table_code: "T3" } });

    await renderCallbackPage();

    await waitFor(() => {
      expect(mockCancelCheckout).toHaveBeenCalledWith("T3");
    });
  });

  it("calls clearPendingCheckout after successful cancelCheckout", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: true, data: { bill_status: "open", table_code: "T3" } });

    await renderCallbackPage();

    await waitFor(() => {
      expect(mockClearPendingCheckout).toHaveBeenCalled();
    });
  });

  it("does NOT render a Re-launch Square button", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: true, data: { bill_status: "open", table_code: "T3" } });

    await renderCallbackPage();

    // Wait for the cancelled state to settle
    await waitFor(() => {
      expect(screen.getByText("Return to Table")).toBeTruthy();
    });

    // Re-launch Square button must NOT be present
    expect(screen.queryByText("Re-launch Square")).toBeNull();
  });

  it("renders only the Return to Table link in cancelled state", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: true, data: { bill_status: "open", table_code: "T3" } });

    await renderCallbackPage();

    await waitFor(() => {
      expect(screen.getByText("Return to Table")).toBeTruthy();
    });

    // The single link should point to the table detail page
    const link = screen.getByRole("link", { name: "Return to Table" });
    expect(link.getAttribute("href")).toContain("T3");
  });

  it("shows cancelledBillRestored message when cancelCheckout succeeds", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: true, data: { bill_status: "open", table_code: "T3" } });

    await renderCallbackPage();

    await waitFor(() => {
      expect(
        screen.getByText("Checkout cancelled — bill reopened. Return to the table to start a new checkout."),
      ).toBeTruthy();
    });
  });

  it("shows cancelledHint and still clears pending when cancelCheckout fails", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: false, error: "Bill is not in paying state" });

    await renderCallbackPage();

    // Should still clear pending even if cancel API failed
    await waitFor(() => {
      expect(mockClearPendingCheckout).toHaveBeenCalled();
    });

    // Shows the fallback hint (cancelledHint, billRestored=false)
    await waitFor(() => {
      expect(
        screen.getByText("Payment was cancelled. Return to the table to start a new checkout."),
      ).toBeTruthy();
    });

    // Still no Re-launch Square
    expect(screen.queryByText("Re-launch Square")).toBeNull();
  });

  it("does NOT call markPaid in the cancelled branch", async () => {
    mockCancelCheckout.mockResolvedValue({ ok: true, data: { bill_status: "open", table_code: "T3" } });

    await renderCallbackPage();

    await waitFor(() => {
      expect(screen.getByText("Return to Table")).toBeTruthy();
    });

    expect(mockMarkPaid).not.toHaveBeenCalled();
  });
});
