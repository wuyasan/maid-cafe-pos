/**
 * Tests for Fix #1: "paying" status cancel checkout recovery entry.
 *
 * When bill.status === "paying":
 * 1. A "Cancel checkout" button is rendered.
 * 2. Clicking it shows a confirm dialog; on confirm → calls cancelCheckout(tableCode).
 * 3. On success → clearPendingCheckout() is called, refetch() is triggered.
 * 4. On 409 / payment-exists error → shows the "verify in Square" message (does NOT force-unfreeze).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

// ── Mock next-intl ────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const msgs: Record<string, string> = {
      "staff.table.backToFloor": "Back to floor",
      "staff.table.live": "Live",
      "staff.table.stale": "Reconnecting…",
      "staff.table.noBill": "No open bill",
      "staff.table.squarePayment": "Charge with Square",
      "staff.table.markPaid": "Mark as paid",
      "payment.payingStatus": "Bill frozen for payment",
      "payment.cancelCheckout": "Cancel checkout & restore bill",
      "payment.confirmCancelCheckoutTitle": "Cancel checkout?",
      "payment.confirmCancelCheckoutDesc": "This will restore the bill to open so you can charge again.",
      "payment.cancelCheckoutPaymentExists": "A payment exists — verify in Square first before manually resolving.",
      "payment.processing": "Processing…",
      "payment.genericError": "An unexpected error occurred",
      "payment.squareLaunching": "Launching Square…",
      "payment.confirmManualTitle": "Mark as paid?",
      "payment.confirmManualDesc": "Records a manual payment — no Square transaction will be created.",
      "payment.billPaid": "✓ Bill Paid",
    };
    return msgs[`${ns}.${key}`] ?? key;
  },
}));

// ── Mock next/navigation ──────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  usePathname: () => "/staff/table/T1",
}));

// ── Mock next/link ────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── Mock useLiveQuery ─────────────────────────────────────────────────────────
const mockRefetch = vi.fn();
vi.mock("@/lib/hooks/useLiveQuery", () => ({
  useLiveQuery: () => ({
    data: null,
    isStale: false,
    hasFetched: false,
    refetch: mockRefetch,
  }),
}));

// ── Mock ConfirmDialog ────────────────────────────────────────────────────────
const mockConfirm = vi.fn();
vi.mock("@/components/ui/ConfirmDialog", () => ({
  useConfirm: () => ({
    confirm: mockConfirm,
    dialog: null,
  }),
}));

// ── Mock staff actions ────────────────────────────────────────────────────────
const mockCancelCheckout = vi.fn();
const mockStartCheckout = vi.fn();
const mockMarkPaid = vi.fn();

vi.mock("@/lib/server/actions/staff", () => ({
  updateOrderItemQty: vi.fn(),
  deleteOrderItem: vi.fn(),
  startCheckout: (...args: unknown[]) => mockStartCheckout(...args),
  cancelCheckout: (...args: unknown[]) => mockCancelCheckout(...args),
  markPaid: (...args: unknown[]) => mockMarkPaid(...args),
  applyDiscount: vi.fn(),
  removeDiscount: vi.fn(),
}));

// ── Mock squarePos ────────────────────────────────────────────────────────────
const mockClearPendingCheckout = vi.fn();

vi.mock("@/lib/squarePos", () => ({
  getSquareConfig: vi.fn().mockReturnValue({ applicationId: "sq0id-test", callbackUrl: "https://example.com" }),
  buildSquarePosUrl: vi.fn().mockReturnValue("square-commerce-v1://payment/create?data=test"),
  savePendingCheckout: vi.fn(),
  clearPendingCheckout: () => mockClearPendingCheckout(),
  readPendingCheckout: vi.fn().mockReturnValue(null),
}));

// ── Mock money ────────────────────────────────────────────────────────────────
vi.mock("@/lib/money", () => ({
  formatUSD: (n: number) => `$${Number(n).toFixed(2)}`,
}));

import React from "react";
import { TableDetail } from "./TableDetail";
import type { BillDetail, BillItem } from "@/lib/types";

const SAMPLE_ITEM: BillItem = {
  order_item_id: 1,
  menu_item_id: 1,
  menu_item_name: "Tea",
  item_type: "regular",
  quantity: 1,
  unit_price: "5.00",
  total_price: "5.00",
  notes: null,
  production_status: null,
  selected_maids: [],
};

// A minimal "paying" bill fixture — must have items so the payment panel renders
const PAYING_BILL: BillDetail = {
  id: 42,
  status: "paying",
  total: "25.50",
  subtotal: "25.50",
  discount_type: "none",
  discount_value: "0",
  discount_amount: "0.00",
  discount_note: null,
  tip_type: "none",
  tip_value: "0",
  tip_amount: "0.00",
  tax: "0.00",
  service_charge: "0.00",
  items: [SAMPLE_ITEM],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirm.mockResolvedValue(false); // default: user cancels
});

describe("TableDetail — paying status cancel checkout", () => {
  it("renders the Cancel checkout button when bill.status is 'paying'", () => {
    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL} />);
    expect(screen.getByText("Cancel checkout & restore bill")).toBeTruthy();
  });

  it("does NOT render Cancel checkout button when bill.status is 'open'", () => {
    const openBill: BillDetail = { ...PAYING_BILL, status: "open" };
    render(<TableDetail tableCode="T1" initialBill={openBill} />);
    expect(screen.queryByText("Cancel checkout & restore bill")).toBeNull();
  });

  it("shows a confirm dialog when the cancel button is clicked", async () => {
    mockConfirm.mockResolvedValue(false);
    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL} />);

    const btn = screen.getByText("Cancel checkout & restore bill");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Cancel checkout?" }),
      );
    });
  });

  it("does NOT call cancelCheckout when user declines confirm", async () => {
    mockConfirm.mockResolvedValue(false);
    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL} />);

    fireEvent.click(screen.getByText("Cancel checkout & restore bill"));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockCancelCheckout).not.toHaveBeenCalled();
  });

  it("calls cancelCheckout(tableCode) after user confirms", async () => {
    mockConfirm.mockResolvedValue(true);
    mockCancelCheckout.mockResolvedValue({
      ok: true,
      data: { bill_status: "open", table_code: "T1", bill_id: 42, success: true, session_table_status: "occupied" },
    });

    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL} />);
    fireEvent.click(screen.getByText("Cancel checkout & restore bill"));

    await waitFor(() => {
      expect(mockCancelCheckout).toHaveBeenCalledWith("T1");
    });
  });

  it("calls clearPendingCheckout() and refetch() on successful cancel", async () => {
    mockConfirm.mockResolvedValue(true);
    mockCancelCheckout.mockResolvedValue({
      ok: true,
      data: { bill_status: "open", table_code: "T1", bill_id: 42, success: true, session_table_status: "occupied" },
    });

    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL} />);
    fireEvent.click(screen.getByText("Cancel checkout & restore bill"));

    await waitFor(() => {
      expect(mockClearPendingCheckout).toHaveBeenCalled();
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it("shows 'verify in Square' message on 409 / payment-exists error (does not call clearPendingCheckout)", async () => {
    mockConfirm.mockResolvedValue(true);
    mockCancelCheckout.mockResolvedValue({
      ok: false,
      error: "A payment record already exists for this bill",
    });

    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL} />);
    fireEvent.click(screen.getByText("Cancel checkout & restore bill"));

    await waitFor(() => {
      expect(
        screen.getByText("A payment exists — verify in Square first before manually resolving."),
      ).toBeTruthy();
    });

    // clearPendingCheckout must NOT be called — we do not force-unfreeze
    expect(mockClearPendingCheckout).not.toHaveBeenCalled();
  });
});


// ── New: cancelCheckoutPending guard for Square + Manual buttons ──────────────
describe("TableDetail — cancelCheckoutPending disables Square + Manual buttons", () => {
  // A "paying" bill — the cancel button is visible which is how we trigger
  // cancelCheckoutPending=true (by clicking cancel, confirming, and having
  // cancelCheckout hang so the pending state persists).
  const PAYING_BILL_LOCAL: BillDetail = {
    id: 99,
    status: "paying",
    total: "30.00",
    subtotal: "30.00",
    discount_type: "none",
    discount_value: "0",
    discount_amount: "0.00",
    discount_note: null,
    tip_type: "none",
    tip_value: "0",
    tip_amount: "0.00",
    tax: "0.00",
    service_charge: "0.00",
    items: [SAMPLE_ITEM],
  };

  it("Square + Manual buttons are disabled and no-op while cancelCheckoutPending is true", async () => {
    // cancelCheckout hangs → setCancelCheckoutPending(true) stays true
    let resolveCancel!: (v: unknown) => void;
    mockCancelCheckout.mockReturnValue(new Promise((res) => { resolveCancel = res; }));
    mockConfirm.mockResolvedValue(true); // user confirms cancel

    render(<TableDetail tableCode="T1" initialBill={PAYING_BILL_LOCAL} />);

    // Trigger cancel — after confirm it sets cancelCheckoutPending=true and awaits
    const cancelBtn = screen.getByText("Cancel checkout & restore bill");
    fireEvent.click(cancelBtn);

    // Wait for confirm to be called and the handler to enter pending state
    await waitFor(() => expect(mockCancelCheckout).toHaveBeenCalled());

    // At this point cancelCheckoutPending should be true.
    // The Square and Manual buttons should be disabled.
    const squareBtn = screen.getByText("Charge with Square").closest("button")!;
    const manualBtn = screen.getByText("Mark as paid").closest("button")!;

    expect(squareBtn).toBeTruthy();
    expect(manualBtn).toBeTruthy();
    expect(squareBtn.hasAttribute("disabled")).toBe(true);
    expect(manualBtn.hasAttribute("disabled")).toBe(true);

    // Clicking Square while disabled should be a no-op (no startCheckout called)
    mockStartCheckout.mockResolvedValue({ ok: true, data: { bill_id: 1, checkout_total: "30.00" } });
    fireEvent.click(squareBtn);
    expect(mockStartCheckout).not.toHaveBeenCalled();

    // Clicking Manual while disabled should be a no-op (no markPaid called)
    fireEvent.click(manualBtn);
    expect(mockMarkPaid).not.toHaveBeenCalled();

    // Resolve the hung cancel to clean up
    await act(async () => {
      resolveCancel({ ok: true, data: { bill_status: "open", table_code: "T1", bill_id: 99, success: true, session_table_status: "occupied" } });
      await Promise.resolve();
    });
  });

  it("cancel button is disabled while squarePending is true (symmetric guard)", async () => {
    // To get squarePending=true we need an open bill (paying bills hide Square button).
    // Actually the cancel button only appears when billPaying=true AND !squarePending.
    // So the cancel button is already hidden when squarePending is true by the
    // conditional render `{billPaying && !squarePending && ...}`.
    // This test documents that symmetry: when squarePending is true the cancel button
    // is not rendered at all.
    const openBill: BillDetail = { ...PAYING_BILL_LOCAL, status: "paying" };

    // Make startCheckout hang so squarePending stays true
    let resolveStart!: (v: unknown) => void;
    mockStartCheckout.mockReturnValue(new Promise((res) => { resolveStart = res; }));
    mockConfirm.mockResolvedValue(true);

    render(<TableDetail tableCode="T1" initialBill={openBill} />);

    // Before square is triggered, cancel button should be visible
    expect(screen.queryByText("Cancel checkout & restore bill")).toBeTruthy();

    // Click Square (first it checks getSquareConfig which is mocked, then calls startCheckout)
    const squareBtn = screen.getByText("Charge with Square").closest("button")!;
    fireEvent.click(squareBtn);

    // startCheckout is async — wait for it to be called
    await waitFor(() => expect(mockStartCheckout).toHaveBeenCalled());

    // Now squarePending is true → the cancel button should be hidden
    // (the condition is `{billPaying && !squarePending && ...}`)
    await waitFor(() => {
      expect(screen.queryByText("Cancel checkout & restore bill")).toBeNull();
    });

    // Resolve to clean up
    await act(async () => {
      resolveStart({ ok: false, error: "test cleanup" });
      await Promise.resolve();
    });
  });
});
