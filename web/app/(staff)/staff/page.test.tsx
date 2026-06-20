/**
 * Tests for StaffHomePage: the Admin tile in the dashboard grid is gated on
 * role === "admin", matching the sidebar (StaffShell). Non-admins must not see
 * the Admin tile — clicking it would bounce them to /login via proxy.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SessionPayload } from "@/lib/auth-core";

// next-intl/server: echo keys; locale → "en".
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));

// next/link: passthrough anchor.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// getSession is the role source. Overridden per-test.
const getSession = vi.fn<() => Promise<SessionPayload | null>>();
vi.mock("@/lib/server/auth", () => ({
  getSession: () => getSession(),
}));

import StaffHomePage from "./page";

function session(role: SessionPayload["role"]): SessionPayload {
  return { uid: 1, username: "u", name: "U", role, iat: 0, exp: 0 };
}

async function renderHome() {
  render(await StaffHomePage());
}

const adminTile = () => document.querySelector('a[href="/admin"]');

describe("StaffHomePage — Admin tile role gating", () => {
  beforeEach(() => getSession.mockReset());

  it("renders the Admin tile for an admin", async () => {
    getSession.mockResolvedValue(session("admin"));
    await renderHome();
    expect(adminTile()).not.toBeNull();
    // Non-admin tiles are always present.
    expect(document.querySelector('a[href="/staff/floor"]')).not.toBeNull();
  });

  it("hides the Admin tile for a manager", async () => {
    getSession.mockResolvedValue(session("manager"));
    await renderHome();
    expect(adminTile()).toBeNull();
    expect(document.querySelector('a[href="/staff/floor"]')).not.toBeNull();
  });

  it("hides the Admin tile for staff", async () => {
    getSession.mockResolvedValue(session("staff"));
    await renderHome();
    expect(adminTile()).toBeNull();
  });

  it("hides the Admin tile when there is no session", async () => {
    getSession.mockResolvedValue(null);
    await renderHome();
    expect(adminTile()).toBeNull();
    expect(screen.queryByText("home.title")).not.toBeNull();
  });
});
