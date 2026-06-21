/**
 * Tests for PinLoginForm error-code → i18n message mapping.
 *
 * Coverage:
 *  - rateLimited errorCode shows the rate-limit message
 *  - wrongPin errorCode shows the wrong-PIN message
 *  - error errorCode shows the generic error message
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
      "auth.roleStaff": "Staff",
      "auth.roleAdmin": "Admin",
      "auth.idPlaceholder": "ID",
      "auth.pinPlaceholder": "PIN",
      "auth.submit": "Sign in",
      "auth.wrongPin": "Incorrect PIN. Please try again.",
      "auth.rateLimited": "Too many attempts. Please wait and try again.",
      "auth.error": "Login failed. Please try again.",
    };
    return msgs[`${ns}.${key}`] ?? key;
  },
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockAction(result: LoginResult) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (_role: "staff" | "admin", _pin: string) => result);
}

async function submitForm(pin = "1234") {
  const input = screen.getByPlaceholderText("PIN");
  fireEvent.change(input, { target: { value: pin } });
  const form = input.closest("form")!;
  fireEvent.submit(form);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PinLoginForm — error code → message mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows rate-limit message when loginAction returns rateLimited errorCode", async () => {
    const action = makeMockAction({ ok: false, errorCode: "rateLimited" });
    render(<PinLoginForm loginAction={action} />);

    await submitForm();

    await waitFor(() => {
      expect(
        screen.getByText("Too many attempts. Please wait and try again."),
      ).toBeTruthy();
    });
  });

  it("shows wrong-PIN message when loginAction returns wrongPin errorCode", async () => {
    const action = makeMockAction({ ok: false, errorCode: "wrongPin" });
    render(<PinLoginForm loginAction={action} />);

    await submitForm();

    await waitFor(() => {
      expect(
        screen.getByText("Incorrect PIN. Please try again."),
      ).toBeTruthy();
    });
  });

  it("shows generic error message when loginAction returns error errorCode", async () => {
    const action = makeMockAction({ ok: false, errorCode: "error" });
    render(<PinLoginForm loginAction={action} />);

    await submitForm();

    await waitFor(() => {
      expect(screen.getByText("Login failed. Please try again.")).toBeTruthy();
    });
  });
});
