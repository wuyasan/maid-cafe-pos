/**
 * Tests for StaffUsersClient: list rendering, create, disable (confirm flow),
 * and reset-PIN flow.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StaffUsersClient } from "./StaffUsersClient";
import type { StaffUserAdmin } from "@/lib/types";

// ── Mock next-intl — echoes keys, interpolates {name} ────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars?.name ? `${key}:${vars.name}` : key,
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// ── Mock server actions ──────────────────────────────────────────────────────
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockSetActive = vi.fn();
const mockResetPin = vi.fn();
vi.mock("@/lib/server/actions/admin", () => ({
  createStaffUser: (...a: unknown[]) => mockCreate(...a),
  updateStaffUser: (...a: unknown[]) => mockUpdate(...a),
  setStaffUserActive: (...a: unknown[]) => mockSetActive(...a),
  resetStaffUserPin: (...a: unknown[]) => mockResetPin(...a),
}));

// ── Mock ConfirmDialog — auto-confirms ───────────────────────────────────────
vi.mock("@/components/ui/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true), dialog: null }),
}));

// ── Mock StateCard — render variant/title + a retry button ──────────────────
vi.mock("@/components/ui/StateCard", () => ({
  StateCard: ({
    variant,
    title,
    onRetry,
  }: {
    variant: string;
    title?: string;
    onRetry?: () => void;
  }) => (
    <div data-testid="state-card" data-variant={variant}>
      <span>{title}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          retry
        </button>
      ) : null}
    </div>
  ),
}));

// ── Mock adminStyles ─────────────────────────────────────────────────────────
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
}));

// ── Test data ────────────────────────────────────────────────────────────────
const ALICE: StaffUserAdmin = {
  id: 1, username: "alice", display_name: "Alice", role: "admin",
  is_active: true, last_login_at: null, created_at: "2024-01-01T00:00:00Z",
};
const BOB: StaffUserAdmin = {
  id: 2, username: "bob", display_name: "Bob", role: "staff",
  is_active: true, last_login_at: null, created_at: "2024-01-01T00:00:00Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("StaffUsersClient", () => {
  it("renders the list of users with usernames and roles", () => {
    render(<StaffUsersClient initialUsers={[ALICE, BOB]} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("@alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("@bob")).toBeTruthy();
  });

  it("shows the empty state when there are no users", () => {
    render(<StaffUsersClient initialUsers={[]} />);
    expect(screen.getByText("staffUsers.noUsers")).toBeTruthy();
  });

  it("creates a user via the new-user form", async () => {
    mockCreate.mockResolvedValue({
      ok: true,
      data: { ...BOB, id: 3, username: "carol", display_name: "Carol", role: "manager" },
    });
    render(<StaffUsersClient initialUsers={[]} />);

    fireEvent.click(screen.getByText(/staffUsers\.newUser/));

    fireEvent.change(screen.getByLabelText("staffUsers.fields.username"), { target: { value: "carol" } });
    fireEvent.change(screen.getByLabelText("staffUsers.fields.displayName"), { target: { value: "Carol" } });
    fireEvent.change(screen.getByLabelText("staffUsers.fields.role"), { target: { value: "manager" } });
    fireEvent.change(screen.getByLabelText("staffUsers.fields.pin"), { target: { value: "4321" } });

    fireEvent.click(screen.getByText("staffUsers.save"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        username: "carol", display_name: "Carol", role: "manager", pin: "4321",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Carol")).toBeTruthy();
    });
  });

  it("disables a user (optimistic) through the confirm flow", async () => {
    mockSetActive.mockResolvedValue({ ok: true, data: { ...BOB, is_active: false } });
    render(<StaffUsersClient initialUsers={[BOB]} />);

    // Disable button carries the object name via aria-label
    fireEvent.click(screen.getByLabelText("staffUsers.disableAria:Bob"));

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith(2, false);
    });
    await waitFor(() => {
      expect(screen.getByText("staffUsers.disabled")).toBeTruthy();
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("restores active state if disabling fails", async () => {
    mockSetActive.mockResolvedValue({ ok: false, error: "Forbidden" });
    render(<StaffUsersClient initialUsers={[BOB]} />);

    fireEvent.click(screen.getByLabelText("staffUsers.disableAria:Bob"));

    await waitFor(() => {
      expect(screen.getByText("Forbidden")).toBeTruthy();
    });
    // The "disabled" badge must NOT be present — state was rolled back
    expect(screen.queryByText("staffUsers.disabled")).toBeNull();
  });

  it("resets a PIN via the reset-PIN form", async () => {
    mockResetPin.mockResolvedValue({ ok: true });
    render(<StaffUsersClient initialUsers={[ALICE]} />);

    fireEvent.click(screen.getByLabelText("staffUsers.resetPinAria:Alice"));

    fireEvent.change(screen.getByLabelText("staffUsers.fields.newPin"), { target: { value: "8888" } });
    // Two "Reset PIN" labels now exist (row button + form submit); submit the form.
    fireEvent.submit(screen.getByLabelText("staffUsers.fields.newPin").closest("form")!);

    await waitFor(() => {
      expect(mockResetPin).toHaveBeenCalledWith(1, "8888");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  // ── P1: surface backend 422 detail in the create form ──────────────────────
  it("shows the backend 422 error message when create fails", async () => {
    mockCreate.mockResolvedValue({ ok: false, error: "username already taken" });
    render(<StaffUsersClient initialUsers={[]} />);

    fireEvent.click(screen.getByText(/staffUsers\.newUser/));
    fireEvent.change(screen.getByLabelText("staffUsers.fields.username"), { target: { value: "dupe" } });
    fireEvent.change(screen.getByLabelText("staffUsers.fields.displayName"), { target: { value: "Dupe" } });
    fireEvent.change(screen.getByLabelText("staffUsers.fields.pin"), { target: { value: "4321" } });
    fireEvent.click(screen.getByText("staffUsers.save"));

    await waitFor(() => {
      expect(screen.getByText("username already taken")).toBeTruthy();
    });
  });

  // ── P1: client helper attrs guard the pin/username fields ───────────────────
  it("applies client-side validation patterns to pin and username", () => {
    render(<StaffUsersClient initialUsers={[]} />);
    fireEvent.click(screen.getByText(/staffUsers\.newUser/));

    const pin = screen.getByLabelText("staffUsers.fields.pin") as HTMLInputElement;
    expect(pin.pattern).toBe("\\d{4,12}");
    expect(pin.inputMode).toBe("numeric");

    const username = screen.getByLabelText("staffUsers.fields.username") as HTMLInputElement;
    expect(username.pattern).toBe("[a-z0-9_.-]{3,50}");
  });

  // ── P2: explicit load-error state, distinct from the genuine empty state ────
  it("renders an error state (not the empty state) when loadError is true", () => {
    render(<StaffUsersClient initialUsers={[]} loadError />);
    const card = screen.getByTestId("state-card");
    expect(card.getAttribute("data-variant")).toBe("error");
    expect(screen.getByText("staffUsers.loadErrorTitle")).toBeTruthy();
    // The genuine empty-state text must NOT be shown.
    expect(screen.queryByText("staffUsers.noUsers")).toBeNull();
    // New-user button is hidden in the error state.
    expect(screen.queryByText(/staffUsers\.newUser/)).toBeNull();
  });

  it("retries via router.refresh from the load-error state", () => {
    render(<StaffUsersClient initialUsers={[]} loadError />);
    fireEvent.click(screen.getByText("retry"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows the empty state (not the error state) on a successful empty fetch", () => {
    render(<StaffUsersClient initialUsers={[]} loadError={false} />);
    expect(screen.getByText("staffUsers.noUsers")).toBeTruthy();
    expect(screen.queryByTestId("state-card")).toBeNull();
  });
});
