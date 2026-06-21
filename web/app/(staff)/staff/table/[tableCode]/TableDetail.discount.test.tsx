/**
 * Tests for F15 — bill discount in the staff Table Detail panel.
 *
 * Covers:
 *  - Apply percent discount → applyDiscount called with {type:"percent", value, note}.
 *  - Apply fixed discount → applyDiscount called with {type:"fixed", value}.
 *  - Discount line + Remove control shown when a discount is present; remove → removeDiscount.
 *  - Discount controls hidden / disabled while the bill is in "paying" (not open).
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
      "payment.discount.subtotal": "Subtotal",
      "payment.discount.total": "Total",
      "payment.discount.label": "Discount",
      "payment.discount.apply": "Apply discount",
      "payment.discount.edit": "Edit discount",
      "payment.discount.remove": "Remove discount",
      "payment.discount.removing": "Removing…",
      "payment.discount.applying": "Applying…",
      "payment.discount.modalTitle": "Apply discount",
      "payment.discount.typePercent": "Percent (%)",
      "payment.discount.typeFixed": "Amount ($)",
      "payment.discount.valueLabel": "Discount value",
      "payment.discount.noteLabel": "Note (optional)",
      "payment.discount.save": "Apply",
      "payment.discount.cancel": "Cancel",
      "payment.discount.confirmTitle": "Apply this discount?",
      "payment.discount.confirmRemoveTitle": "Remove discount?",
      "payment.discount.invalidPercent": "Enter a percentage between 0 and 100.",
      "payment.discount.invalidFixed": "Enter an amount of 0 or more.",
      "payment.discount.errorInvalid": "Invalid discount value.",
      "payment.discount.errorNotOpen": "Discounts can only be changed while the bill is open.",
      "payment.discount.applyFailed": "Could not apply discount.",
      "payment.discount.removeFailed": "Could not remove discount.",
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

// ConfirmDialog — auto-resolve true so confirm-gated actions proceed.
const mockConfirm = vi.fn();
vi.mock("@/components/ui/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: mockConfirm, dialog: null }),
}));

const mockApplyDiscount = vi.fn();
const mockRemoveDiscount = vi.fn();
vi.mock("@/lib/server/actions/staff", () => ({
  updateOrderItemQty: vi.fn(),
  deleteOrderItem: vi.fn(),
  startCheckout: vi.fn(),
  cancelCheckout: vi.fn(),
  markPaid: vi.fn(),
  applyDiscount: (...args: unknown[]) => mockApplyDiscount(...args),
  removeDiscount: (...args: unknown[]) => mockRemoveDiscount(...args),
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

const DISCOUNTED_BILL: BillDetail = {
  ...OPEN_BILL,
  discount_type: "percent",
  discount_value: "10",
  discount_amount: "2.00",
  discount_note: "regular",
  total: "18.00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
});

describe("TableDetail — apply discount", () => {
  it("applies a percent discount with the entered value and note", async () => {
    mockApplyDiscount.mockResolvedValue({ ok: true, data: DISCOUNTED_BILL });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);

    fireEvent.click(screen.getByText("Apply discount"));
    // Modal open — percent is the default type.
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "regular" } });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(mockApplyDiscount).toHaveBeenCalledWith("T1", {
        type: "percent",
        value: "10",
        note: "regular",
      });
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("applies a fixed discount (no note) with type 'fixed'", async () => {
    mockApplyDiscount.mockResolvedValue({ ok: true, data: DISCOUNTED_BILL });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);

    fireEvent.click(screen.getByText("Apply discount"));
    fireEvent.click(screen.getByText("Amount ($)")); // switch to fixed
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(mockApplyDiscount).toHaveBeenCalledWith("T1", {
        type: "fixed",
        value: "5",
        note: undefined,
      });
    });
  });

  it("passes a very large fixed discount as a string without JS number rounding", async () => {
    mockApplyDiscount.mockResolvedValue({ ok: true, data: DISCOUNTED_BILL });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);

    fireEvent.click(screen.getByText("Apply discount"));
    fireEvent.click(screen.getByText("Amount ($)"));
    fireEvent.change(screen.getByLabelText("Discount value"), {
      target: { value: "12345678901234567890" },
    });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(mockApplyDiscount).toHaveBeenCalledWith("T1", {
        type: "fixed",
        value: "12345678901234567890",
        note: undefined,
      });
    });
  });

  it("does not advertise a fixed-discount upper cap in the input", () => {
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);

    fireEvent.click(screen.getByText("Apply discount"));
    fireEvent.click(screen.getByText("Amount ($)"));

    const input = screen.getByLabelText("Discount value");
    expect(input.getAttribute("max")).toBeNull();
    expect(input.getAttribute("inputMode")).toBe("decimal");
  });

  it("rejects an out-of-range percent locally (no action call)", async () => {
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Apply discount"));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(screen.getByText("Enter a percentage between 0 and 100.")).toBeTruthy();
    });
    expect(mockApplyDiscount).not.toHaveBeenCalled();
  });

  it("limits the free-text note to the backend field length and renders a counter", () => {
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Apply discount"));

    expect(screen.getByLabelText("Note (optional)").getAttribute("maxLength")).toBe("500");

    // Character counter renders and tracks the current note length.
    const counter = screen.getByTestId("discount-note-count");
    expect(counter.textContent).toBe("0/500");
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "regular" } });
    expect(counter.textContent).toBe("7/500");
  });

  it("surfaces a 422 invalid-value backend error", async () => {
    mockApplyDiscount.mockResolvedValue({ ok: false, error: "422 invalid value" });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Apply discount"));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(screen.getByText("Invalid discount value.")).toBeTruthy();
    });
  });
});

describe("TableDetail — discount display + remove", () => {
  it("shows the discount line and the Remove control when a discount is present", () => {
    render(<TableDetail tableCode="T1" initialBill={DISCOUNTED_BILL} />);
    expect(screen.getByTestId("discount-row")).toBeTruthy();
    expect(screen.getByText("−$2.00")).toBeTruthy();
    expect(screen.getByText("Remove discount")).toBeTruthy();
    // Apply control shows "Edit" label when already discounted.
    expect(screen.getByText("Edit discount")).toBeTruthy();
  });

  it("removes the discount after confirm", async () => {
    mockRemoveDiscount.mockResolvedValue({ ok: true, data: OPEN_BILL });
    render(<TableDetail tableCode="T1" initialBill={DISCOUNTED_BILL} />);

    fireEvent.click(screen.getByText("Remove discount"));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Remove discount?" }),
      );
      expect(mockRemoveDiscount).toHaveBeenCalledWith("T1");
    });
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("TableDetail — discount disabled when not open", () => {
  it("does not render discount controls while the bill is 'paying'", () => {
    const payingBill: BillDetail = { ...OPEN_BILL, status: "paying" };
    render(<TableDetail tableCode="T1" initialBill={payingBill} />);
    expect(screen.queryByText("Apply discount")).toBeNull();
    expect(screen.queryByText("Remove discount")).toBeNull();
  });

  it("surfaces a 409 not-open error when applying to a non-open bill", async () => {
    // Render an open bill so the modal is reachable, but the backend rejects with 409.
    mockApplyDiscount.mockResolvedValue({ ok: false, error: "Bill is not open (409)" });
    render(<TableDetail tableCode="T1" initialBill={OPEN_BILL} />);
    fireEvent.click(screen.getByText("Apply discount"));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(
        screen.getByText("Discounts can only be changed while the bill is open."),
      ).toBeTruthy();
    });
  });
});
