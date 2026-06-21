/**
 * Test: Issue #1 — stale bill fallback after polling returns null.
 *
 * Verifies that once hasFetched=true, a null poll response replaces
 * the SSR initialBill (bill items no longer shown) and the paid/thank-you
 * state is displayed instead.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OrderClient } from "./OrderClient";
import type { BillDetail } from "@/lib/types";

// ── Mock next-intl ───────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const msgs: Record<string, string> = {
      "customer.all": "All",
      "customer.maidService": "Maid Service",
      "customer.cart": "Cart",
      "customer.add": "Add",
      "customer.addMore": "Add more",
      "customer.empty": "Empty",
      "customer.noSessionHint": "No session",
      "customer.currentBill": "Current bill",
      "customer.live": "Live",
      "customer.billPaid": "Your bill is settled — thank you!",
      "customer.billPaidHint": "Come back again",
      "customer.statusPending": "Queued",
      "customer.statusPreparing": "Cooking",
      "customer.statusCompleted": "Ready",
      "customer.subtotal": "Subtotal",
      "customer.total": "Total",
      "customer.taxLine": "Tax",
      "customer.placeOrder": "Place Order",
      "customer.loading": "Loading…",
      "customer.items": "items",
      "customer.maidSelected": "maid selected",
    };
    return msgs[`${ns}.${key}`] ?? key;
  },
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// ── Mock server actions ──────────────────────────────────────────────────────
vi.mock("@/lib/server/actions/orders", () => ({
  submitOrderAction: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const ITEM_NAME = "Strawberry Latte";

const initialBill: BillDetail = {
  id: 1,
  status: "open",
  subtotal: "12.00",
  total: "12.00",
  tax: "0.00",
  service_charge: "0.00",
  items: [
    {
      order_item_id: 10,
      menu_item_id: 5,
      menu_item_name: ITEM_NAME,
      item_type: "regular",
      quantity: 1,
      unit_price: "12.00",
      total_price: "12.00",
      notes: null,
      selected_maids: [],
      production_status: "pending",
    },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("OrderClient — hasFetched bill fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows stale initialBill items before first poll resolves", () => {
    // Fetcher never resolves — simulates in-flight state
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(
      <OrderClient
        tableCode="T1"
        items={[]}
        categories={[]}
        maids={[]}
        initialBill={initialBill}
        source="qr"
      />,
    );

    // hasFetched=false, so we show initialBill — item name must be visible
    expect(screen.getByText(ITEM_NAME)).toBeTruthy();
  });

  it("clears stale bill items and shows paid state when poll returns null", async () => {
    // The fetch immediately resolves with null (bill paid/closed)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(null),
        } as Response),
      ),
    );

    render(
      <OrderClient
        tableCode="T1"
        items={[]}
        categories={[]}
        maids={[]}
        initialBill={initialBill}
        source="qr"
      />,
    );

    // Immediately the SSR initialBill is shown (hasFetched still false)
    expect(screen.getByText(ITEM_NAME)).toBeTruthy();

    // Wait for the fetch to resolve — hasFetched becomes true, data=null
    // stale item name must disappear; paid/thank-you state must appear
    await waitFor(() => {
      expect(screen.queryByText(ITEM_NAME)).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText("Your bill is settled — thank you!")).toBeTruthy();
    });
  });
});
