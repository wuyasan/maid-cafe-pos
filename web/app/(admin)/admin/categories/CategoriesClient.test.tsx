/**
 * Test: Admin list delete — no revert after transition ends.
 *
 * Verifies that after a successful delete, the deleted row stays gone
 * and does NOT reappear when the component re-renders with unchanged props
 * (simulating the gap before router.refresh() delivers new RSC props).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CategoriesClient } from "./CategoriesClient";
import type { CategoryAdmin } from "@/lib/types";

// ── Mock next-intl ───────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// ── Mock server actions ──────────────────────────────────────────────────────
const mockDeleteCategory = vi.fn();
vi.mock("@/lib/server/actions/admin", () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}));

// ── Mock ConfirmDialog — auto-confirms ───────────────────────────────────────
vi.mock("@/components/ui/ConfirmDialog", () => ({
  useConfirm: () => ({
    confirm: () => Promise.resolve(true),
    dialog: null,
  }),
}));

// ── Mock adminStyles (returns minimal objects so tests don't crash on CSS vars) ──
vi.mock("@/components/admin/adminStyles", () => ({
  adminCard: {},
  adminInput: {},
  adminLabel: {},
  btnPrimary: {},
  btnPrimaryDisabled: {},
  btnSecondary: {},
  btnDanger: {},
  pageTitle: {},
  pageSubtitle: {},
  errorBanner: {},
  pillBadge: {},
  stationBadgeStyle: () => ({}),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const CAT_A: CategoryAdmin = {
  id: 1,
  name: "Drinks",
  display_order: 0,
  production_station: "bar",
  item_count: 3,
  created_at: "2024-01-01T00:00:00Z",
};

const CAT_B: CategoryAdmin = {
  id: 2,
  name: "Food",
  display_order: 1,
  production_station: "kitchen",
  item_count: 5,
  created_at: "2024-01-01T00:00:00Z",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CategoriesClient — delete does not revert", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockRefresh.mockReset();
    mockDeleteCategory.mockReset();
  });

  it("renders both categories initially", () => {
    render(<CategoriesClient initialCategories={[CAT_A, CAT_B]} />);
    expect(screen.getByText("Drinks")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
  });

  it("removes deleted row immediately and keeps it gone after transition ends", async () => {
    mockDeleteCategory.mockResolvedValue({ ok: true });

    render(<CategoriesClient initialCategories={[CAT_A, CAT_B]} />);

    // Find all Delete buttons — first one belongs to Drinks (CAT_A, display_order 0)
    const deleteButtons = screen.getAllByText("categories.delete");
    expect(deleteButtons).toHaveLength(2);

    // Click delete on the first row (Drinks)
    fireEvent.click(deleteButtons[0]);

    // Row disappears immediately (optimistic local state)
    await waitFor(() => {
      expect(screen.queryByText("Drinks")).toBeNull();
    });

    // Food should still be there
    expect(screen.getByText("Food")).toBeTruthy();

    // Wait for async action + router.refresh() call
    await waitFor(() => {
      expect(mockDeleteCategory).toHaveBeenCalledWith(CAT_A.id);
    });

    // Drinks must STILL be gone — it must not reappear
    expect(screen.queryByText("Drinks")).toBeNull();

    // router.refresh was called to sync RSC props in the background
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("restores deleted row if the server action fails", async () => {
    mockDeleteCategory.mockResolvedValue({ ok: false, error: "Forbidden" });

    render(<CategoriesClient initialCategories={[CAT_A, CAT_B]} />);

    const deleteButtons = screen.getAllByText("categories.delete");
    fireEvent.click(deleteButtons[0]);

    // Row disappears optimistically
    await waitFor(() => {
      expect(screen.queryByText("Drinks")).toBeNull();
    });

    // After the failed action, the row should be restored
    await waitFor(() => {
      expect(screen.getByText("Drinks")).toBeTruthy();
    });

    // An error banner with the server message should appear
    await waitFor(() => {
      expect(screen.getByText("Forbidden")).toBeTruthy();
    });
  });
});
