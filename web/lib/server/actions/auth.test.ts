/**
 * Tests for loginAction (username + PIN flow).
 *
 * We mock the server-runtime deps (next/headers, auth cookie writer, api-client)
 * so the action's pure orchestration logic is testable in Node/jsdom.
 *
 * Coverage:
 *  - success → createSession called with {uid, username, name, role} from api result
 *  - 401 / backend error → wrongPin errorCode (no session written)
 *  - repeated failures → rateLimited errorCode after the threshold
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// next/headers — no XFF (TRUST_PROXY default off → global bucket per username)
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

const mockCreateSession = vi.fn();
const mockClearSession = vi.fn();
vi.mock("@/lib/server/auth", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  clearSession: (...args: unknown[]) => mockClearSession(...args),
}));

const mockStaffLogin = vi.fn();
vi.mock("@/lib/server/api-client", () => ({
  api: { staffLogin: (...args: unknown[]) => mockStaffLogin(...args) },
}));

import { loginAction } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loginAction — username + PIN", () => {
  it("on success, writes a session with the identity from the api result", async () => {
    mockStaffLogin.mockResolvedValue({
      id: 7,
      username: "alice",
      display_name: "Alice",
      role: "manager",
    });

    const result = await loginAction("alice", "1234");

    expect(result).toEqual({ ok: true });
    expect(mockStaffLogin).toHaveBeenCalledWith("alice", "1234");
    expect(mockCreateSession).toHaveBeenCalledWith({
      uid: 7,
      username: "alice",
      name: "Alice",
      role: "manager",
    });
  });

  it("trims the username before calling the backend", async () => {
    mockStaffLogin.mockResolvedValue({ id: 1, username: "bob", display_name: "Bob", role: "staff" });
    await loginAction("  bob  ", "9999");
    expect(mockStaffLogin).toHaveBeenCalledWith("bob", "9999");
  });

  it("returns wrongPin and writes no session when the backend rejects", async () => {
    mockStaffLogin.mockRejectedValue(new Error("Unauthorized"));

    const result = await loginAction("alice", "0000");

    expect(result).toEqual({ ok: false, errorCode: "wrongPin" });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("returns rateLimited after too many failed attempts for the same username", async () => {
    mockStaffLogin.mockRejectedValue(new Error("Unauthorized"));

    // The module-level limiter allows up to MAX_FAILURES (10) before locking.
    let last: Awaited<ReturnType<typeof loginAction>> = { ok: false, errorCode: "wrongPin" };
    for (let i = 0; i < 15; i++) {
      last = await loginAction("ratelimited-user", "0000");
    }
    expect(last).toEqual({ ok: false, errorCode: "rateLimited" });
  });
});
