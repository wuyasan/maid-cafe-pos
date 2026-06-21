/**
 * Tests for F16 — bill tip in the staff Table Detail panel.
 *
 * Covers:
 *  - Add percent tip → applyTip called with {type:"percent", value:<number>}.
 *  - Add fixed tip → applyTip called with {type:"fixed", value:<number>}.
 *  - Tip line + Remove control shown when a tip is present; remove → removeTip.
 *  - Tip controls hidden while the bill is in "paying" (not open).
 *  - 409 (not open) and 422 (invalid) backend errors surface friendly messages.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ── Mock next-intl ────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const msgs: Record<string, string> = {
      "staff.table.backToFloor": "Back to floor",
      "staff.table.live": "Live",
      "staff.table.stale": "Reconnecting…",
      "staff.table.squarePayment": "Charge with Square",
      "staff.table.markPaid": "Mark as paid",
      // discount keys (panel renders both controls)
      "payment.discount.subtotal": "Subtotal",
      "payment.discount.total": "Total",
      "payment.discount.label": "Discount",
      "payment.discount.apply": "Apply discount",
      "payment.discount.edit": "Edit discount",
      "payment.discount.remove": "Remove discount",
      // tip keys
      "payment.tip.subtotal": "Subtotal",
      "payment.tip.total": "Total",
      "payment.tip.label": "Tip",
      "payment.tip.apply": "Add tip",
      "payment.tip.edit": "Edit tip",
      "payment.tip.remove": "Remove tip",
      "payment.tip.removing": "Removing…",
      "payment.tip.applying": "Adding…",
      "payment.tip.modalTitle": "Add tip",
      "payment.tip.typePercent": "Percent (%)",
      "payment.tip.typeFixed": "Amount ($)",
      "payment.tip.valueLabel": "Tip value",
      "payment.tip.save": "Add",
      "payment.tip.cancel": "Cancel",
      "payment.tip.confirmTitle": "Add this tip?",
      "payment.tip.confirmRemoveTitle": "Remove tip?",
      "payment.tip.invalidPercent": "Enter a percentage between 0 and 100.",
      "payment.tip.invalidFixed": "Enter an amount of 0 or more.",
      "payment.tip.errorInvalid": "Invalid tip value.",
      "payment.tip.errorNotOpen": "Tips can only be changed while the bill is open.",
      "payment.tip.applyFailed": "Could not add tip.",
      "payment.tip.removeFailed": "Could not remove tip.",
    };
    return msgs[`${ns}.${key}`] ?? key;
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/staff/table/T1" }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockRefetch = vi.fn();
vi.mock("@/lib/hooks/useLiveQuery", () => ({
  useLiveQuery: () => ({ data: null, isStale: false, hasFetched: false, refetch: mockRefetch }),
}));

const mockConfirm = vi.fn();
vi.mock("@/components/ui/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: mockConfirm, dialog: null }),
}));

const mockApplyTip = vi.fn();
const mockRemoveTip = vi.fn();
vi.mock("@/lib/server/actions/staff", () => ({
  updateOrderItemQty: vi.fn(),
  deleteOrderItem: vi.fn(),
  startCheckout: vi.fn(),
  cancelCheckout: vi.fn(),
  markPaid: vi.fn(),
  applyDiscount: vi.fn(),
  removeDiscount: vi.fn(),
  applyTip: (...args: unknown[]) => mockApplyTip(...args),
  removeTip: (...args: unknown[]) => mockRemoveTip(...args),
}));

vi.mock("@/lib/squarePos", () => ({
  getSquareConfig: vi.fn().mockReturnValue({ applicationId: "x", callbackUrl: "https://e.com" }),
  buildSquarePosUrl: vi.fn().mockReturnValue("square://x"),
  savePendingCheckout: vi.fn(),
  clearPendingCheckout: vi.fn(),
  readPendingCheckout: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/money", () => ({
  formatUSD: (n: number | string) => `$${Number(n).toFixed(2)}`,
}));

import React from "react";
import { TableDetail } from "./TableDetail";
import type { BillDetail, BillItem } from "@/lib/types";

const ITEM: BillItem = {
  order_item_id: 1,
  menu_item_id: 1,
  menu_item_name: "Tea",
  item_type: "regular",
  quantity: 1,
  unit_price: "20.00",
  total_price: "20.00",
  notes: null,
  production_status: null,
  selected_maids: [],
};

const OPEN_BILL: BillDetail = {
  id: 1,
  status: "open",
  subtotal: "20.00",
  discount_type: "none",
  discount_value: "0",
  discount_amount: "0.00",
  discount_note: null,
  tip_type: "none",
  tip_value: "0",
  tip_amount: "0.00",
  tax: "0.00",
  service_charge: "0.00",
  total: "20.00",
  items: [ITEM],
};

const TIPPED_BILL: BillDetail = {
  ...OPEN_BILL,
  tip_type: "percent",
  tip_value: "10",
  tip_amount: "2.00",
  total: "22.00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
});

describe("TableDetail — add tip", () => {
  it("adds a percent tip with the entered value (as a number)", async () => {
    mockApplyTip.mockResolvedValue({ ok: true, data: TIPPED_BILL });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);

    fireEvent.click(screen.getByText("Add tip"));
    fireEvent.change(screen.getByLabelText("Tip value"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(mockApplyTip).toHaveBeenCalledWith("T1", { type: "percent", value: 10 });
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("adds a fixed tip with type 'fixed' (as a number)", async () => {
    mockApplyTip.mockResolvedValue({ ok: true, data: TIPPED_BILL });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);

    fireEvent.click(screen.getByText("Add tip"));
    fireEvent.click(screen.getByText("Amount ($)")); // switch to fixed
    fireEvent.change(screen.getByLabelText("Tip value"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(mockApplyTip).toHaveBeenCalledWith("T1", { type: "fixed", value: 5 });
    });
  });

  it("advertises the fixed-tip cap of 99999999.99 in the input", () => {
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Add tip"));
    fireEvent.click(screen.getByText("Amount ($)"));
    const input = screen.getByLabelText("Tip value");
    expect(input.getAttribute("max")).toBe("99999999.99");
    expect(input.getAttribute("inputMode")).toBe("decimal");
  });

  it("rejects an out-of-range percent locally (no action call)", async () => {
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Add tip"));
    fireEvent.change(screen.getByLabelText("Tip value"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(screen.getByText("Enter a percentage between 0 and 100.")).toBeTruthy();
    });
    expect(mockApplyTip).not.toHaveBeenCalled();
  });

  it("surfaces a 422 invalid-value backend error", async () => {
    mockApplyTip.mockResolvedValue({ ok: false, error: "422 invalid value" });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Add tip"));
    fireEvent.change(screen.getByLabelText("Tip value"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(screen.getByText("Invalid tip value.")).toBeTruthy();
    });
  });
});

describe("TableDetail — tip display + remove", () => {
  it("shows the tip line (+amount) and the Remove control when a tip is present", () => {
    render(<TableDetail tableCode="T1" initialBill={TIPPED_BILL} />);
    expect(screen.getByTestId("tip-row")).toBeTruthy();
    expect(screen.getByText("+$2.00")).toBeTruthy();
    expect(screen.getByText("Remove tip")).toBeTruthy();
    expect(screen.getByText("Edit tip")).toBeTruthy();
  });

  it("removes the tip after confirm", async () => {
    mockRemoveTip.mockResolvedValue({ ok: true, data: OPEN_BILL });
    render(<TableDetail tableCode="T1" initialBill={TIPPED_BILL} />);

    fireEvent.click(screen.getByText("Remove tip"));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Remove tip?" }),
      );
      expect(mockRemoveTip).toHaveBeenCalledWith("T1");
    });
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("TableDetail — tip disabled when not open", () => {
  it("does not render tip controls while the bill is 'paying'", () => {
    const payingBill: BillDetail = { ...OPEN_BILL, status: "paying" };
    render(<TableDetail tableCode="T1" initialBill={payingBill} />);
    expect(screen.queryByText("Add tip")).toBeNull();
    expect(screen.queryByText("Remove tip")).toBeNull();
  });

  it("surfaces a 409 not-open error when adding to a non-open bill", async () => {
    mockApplyTip.mockResolvedValue({ ok: false, error: "Bill is not open (409)" });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Add tip"));
    fireEvent.change(screen.getByLabelText("Tip value"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(
        screen.getByText("Tips can only be changed while the bill is open."),
      ).toBeTruthy();
    });
  });
});
