/**
 * Tests for StaffShell: the Admin nav entry is gated on role === "admin".
 * proxy.ts blocks manager/staff from /admin server-side; the link is hidden in
 * the UI so the nav has no dead entry for non-admins.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaffShell } from "./StaffShell";

// next-intl: echo keys; useLocale → "en".
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// next/navigation: stable pathname.
vi.mock("next/navigation", () => ({
  usePathname: () => "/staff/floor",
}));

// Server action — not exercised here.
vi.mock("@/lib/server/actions/auth", () => ({
  logoutAction: vi.fn(),
}));

function adminLink() {
  // Admin link is an anchor to /admin.
  return document.querySelector('a[href="/admin"]');
}

describe("StaffShell — Admin entry role gating", () => {
  it("renders the Admin entry for an admin", () => {
    render(
      <StaffShell session={null} role="admin">
        <div>content</div>
      </StaffShell>,
    );
    expect(adminLink()).not.toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("hides the Admin entry for a manager", () => {
    render(
      <StaffShell session={null} role="manager">
        <div>content</div>
      </StaffShell>,
    );
    expect(adminLink()).toBeNull();
  });

  it("hides the Admin entry for staff", () => {
    render(
      <StaffShell session={null} role="staff">
        <div>content</div>
      </StaffShell>,
    );
    expect(adminLink()).toBeNull();
  });

  it("hides the Admin entry when role is absent", () => {
    render(
      <StaffShell session={null}>
        <div>content</div>
      </StaffShell>,
    );
    expect(adminLink()).toBeNull();
  });
});
