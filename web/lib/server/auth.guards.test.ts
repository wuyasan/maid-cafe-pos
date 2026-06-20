/**
 * Tests for the role guards: requireManager / requireAdmin and the
 * assertManagerAction / assertAdminAction server-action variants.
 *
 * We mock server-only, next/headers (cookies) and auth-core so the guard logic
 * runs in Node. The cookie jar is driven by a controllable token + payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "mc_session" && currentToken ? { value: currentToken } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// auth-core: resolveSecret always returns a secret; verifySession decodes our fake token.
let currentPayload: { role: string; name: string } | null = null;
vi.mock("@/lib/auth-core", () => ({
  resolveSecret: () => "test-secret",
  verifySession: async () => currentPayload,
  signSession: async () => "x",
  verifyPin: () => false,
}));

import {
  requireManager,
  requireAdmin,
  assertManagerAction,
  assertAdminAction,
} from "./auth";

function setUser(role: "staff" | "manager" | "admin" | null) {
  if (role === null) {
    currentToken = undefined;
    currentPayload = null;
  } else {
    currentToken = "fake.token.sig";
    currentPayload = { role, name: role };
  }
}

beforeEach(() => {
  setUser(null);
});

describe("requireManager", () => {
  it("returns 401 when unauthenticated", async () => {
    setUser(null);
    const res = await requireManager();
    expect(res?.status).toBe(401);
  });

  it("returns 403 for a plain staff member", async () => {
    setUser("staff");
    const res = await requireManager();
    expect(res?.status).toBe(403);
  });

  it("allows a manager (returns null)", async () => {
    setUser("manager");
    expect(await requireManager()).toBeNull();
  });

  it("allows an admin (returns null)", async () => {
    setUser("admin");
    expect(await requireManager()).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("returns 403 for a manager", async () => {
    setUser("manager");
    const res = await requireAdmin();
    expect(res?.status).toBe(403);
  });

  it("allows an admin (returns null)", async () => {
    setUser("admin");
    expect(await requireAdmin()).toBeNull();
  });
});

describe("assertManagerAction / assertAdminAction", () => {
  it("assertManagerAction returns the session for manager and admin, null for staff", async () => {
    setUser("manager");
    expect(await assertManagerAction()).not.toBeNull();
    setUser("admin");
    expect(await assertManagerAction()).not.toBeNull();
    setUser("staff");
    expect(await assertManagerAction()).toBeNull();
  });

  it("assertAdminAction returns null for manager, session for admin", async () => {
    setUser("manager");
    expect(await assertAdminAction()).toBeNull();
    setUser("admin");
    expect(await assertAdminAction()).not.toBeNull();
  });
});
