/**
 * Tests for PinLoginForm: username + PIN inputs and error-code → i18n mapping.
 *
 * Coverage:
 *  - renders username + PIN fields
 *  - wrongPin errorCode shows the "incorrect username or PIN" message
 *  - rateLimited errorCode shows the rate-limit message
 *  - error errorCode shows the generic error message
 *  - loginAction is called with (username, pin)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PinLoginForm } from "./PinLoginForm";
import type { LoginResult } from "@/lib/server/actions/auth";

// ── Mock next-intl ───────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const msgs: Record<string, string> = {
      "auth.title": "Welcome back",
      "auth.subtitle": "Staff sign in",
      "auth.idLabel": "Username",
      "auth.idPlaceholder": "Username",
      "auth.pinLabel": "PIN",
      "auth.pinPlaceholder": "PIN",
      "auth.submit": "Sign in",
      "auth.wrongPin": "Incorrect username or PIN.",
      "auth.rateLimited": "Too many attempts. Please wait and try again.",
      "auth.error": "Login failed. Please try again.",
    };
    return msgs[`${ns}.${key}`] ?? key;
  },
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockAction(result: LoginResult) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (_username: string, _pin: string) => result);
}

function fillAndSubmit(username = "alice", pin = "1234") {
  fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: username } });
  const pinInput = screen.getByPlaceholderText("PIN");
  fireEvent.change(pinInput, { target: { value: pin } });
  fireEvent.submit(pinInput.closest("form")!);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PinLoginForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a username field and a PIN field", () => {
    render(<PinLoginForm loginAction={makeMockAction({ ok: true })} />);
    expect(screen.getByPlaceholderText("Username")).toBeTruthy();
    expect(screen.getByPlaceholderText("PIN")).toBeTruthy();
  });

  it("calls loginAction with the entered username and pin", async () => {
    const action = makeMockAction({ ok: true });
    render(<PinLoginForm loginAction={action} />);

    fillAndSubmit("bob", "5678");

    await waitFor(() => {
      expect(action).toHaveBeenCalledWith("bob", "5678");
    });
  });

  it("shows the wrong-credentials message on wrongPin errorCode", async () => {
    render(<PinLoginForm loginAction={makeMockAction({ ok: false, errorCode: "wrongPin" })} />);
    fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Incorrect username or PIN.")).toBeTruthy();
    });
  });

  it("shows the rate-limit message on rateLimited errorCode", async () => {
    render(<PinLoginForm loginAction={makeMockAction({ ok: false, errorCode: "rateLimited" })} />);
    fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Too many attempts. Please wait and try again.")).toBeTruthy();
    });
  });

  it("shows the generic error message on error errorCode", async () => {
    render(<PinLoginForm loginAction={makeMockAction({ ok: false, errorCode: "error" })} />);
    fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Login failed. Please try again.")).toBeTruthy();
    });
  });
});
