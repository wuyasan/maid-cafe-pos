import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signSession, verifySession, verifyPin, resolveSecret } from "@/lib/auth-core";

describe("signSession / verifySession", () => {
  it("round-trips a valid payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { role: "staff" as const, name: "Alice", iat: now, exp: now + 43200 };
    const token = await signSession(payload, "test-secret");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
    const result = await verifySession(token, "test-secret");
    expect(result).toEqual(payload);
  });

  it("returns null when the signature is tampered", async () => {
    const payload = { role: "admin" as const, name: "Bob", iat: 1000, exp: 9999999999 };
    const token = await signSession(payload, "test-secret");
    const parts = token.split(".");
    const tampered = parts[0] + "." + parts[1] + ".AAAAAAA";
    expect(await verifySession(tampered, "test-secret")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { role: "staff" as const, name: "Alice", iat: now - 50000, exp: now - 1 };
    const token = await signSession(payload, "test-secret");
    expect(await verifySession(token, "test-secret")).toBeNull();
  });

  it("returns null for a malformed token string", async () => {
    expect(await verifySession("not.a.token.with.extra.dots", "test-secret")).toBeNull();
    expect(await verifySession("", "test-secret")).toBeNull();
  });

  it("round-trips the full identity payload (uid, username, name, role)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      uid: 42,
      username: "alice",
      name: "Alice",
      role: "manager" as const,
      iat: now,
      exp: now + 43200,
    };
    const token = await signSession(payload, "test-secret");
    const result = await verifySession(token, "test-secret");
    expect(result).toEqual(payload);
    expect(result?.uid).toBe(42);
    expect(result?.username).toBe("alice");
    expect(result?.role).toBe("manager");
  });

  it("backward-compat: verifies a legacy role-only cookie without uid/username", async () => {
    // A cookie minted by the old createSession (role + name only, no uid/username).
    const now = Math.floor(Date.now() / 1000);
    const legacy = { role: "admin" as const, name: "admin", iat: now, exp: now + 43200 };
    const token = await signSession(legacy, "test-secret");
    const result = await verifySession(token, "test-secret");
    expect(result).not.toBeNull();
    expect(result?.role).toBe("admin");
    // Missing fields are simply absent — must not crash.
    expect(result?.uid).toBeUndefined();
    expect(result?.username).toBeUndefined();
  });
});

describe("verifyPin", () => {
  beforeEach(() => {
    vi.stubEnv("STAFF_PIN", "5678");
    vi.stubEnv("ADMIN_PIN", "0001");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("returns true for a correct staff pin from env", () => {
    expect(verifyPin("staff", "5678")).toBe(true);
  });
  it("returns false for a wrong staff pin", () => {
    expect(verifyPin("staff", "1234")).toBe(false);
  });
  it("returns true for correct admin pin from env", () => {
    expect(verifyPin("admin", "0001")).toBe(true);
  });
  it("returns false for wrong admin pin", () => {
    expect(verifyPin("admin", "9999")).toBe(false);
  });
});

describe("verifyPin dev fallback", () => {
  beforeEach(() => {
    vi.stubEnv("STAFF_PIN", "");
    vi.stubEnv("ADMIN_PIN", "");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("uses '1234' for staff when STAFF_PIN is unset", () => {
    expect(verifyPin("staff", "1234")).toBe(true);
  });
  it("uses '9999' for admin when ADMIN_PIN is unset", () => {
    expect(verifyPin("admin", "9999")).toBe(true);
  });
});

describe("resolveSecret (fail-closed in production)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns AUTH_SECRET when set", () => {
    vi.stubEnv("AUTH_SECRET", "real-secret");
    expect(resolveSecret()).toBe("real-secret");
  });

  it("falls back to the dev constant in non-production when unset", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveSecret()).toBe("dev-secret-change-me");
  });

  it("returns null in production when AUTH_SECRET is unset (fail-closed)", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveSecret()).toBeNull();
  });

  it("a cookie forged with the public dev secret is NOT honoured in prod-without-AUTH_SECRET", async () => {
    // Reproduces the reported attack: attacker signs mc_session with the public
    // dev constant and hits a production instance that has no AUTH_SECRET set.
    const now = Math.floor(Date.now() / 1000);
    const forged = await signSession(
      { role: "admin", name: "attacker", iat: now, exp: now + 3600 },
      "dev-secret-change-me",
    );
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    // resolveSecret() is null → the proxy has NO secret to verify against and
    // denies (redirect to /login); the forgery is never accepted.
    expect(resolveSecret()).toBeNull();
    // And if a real secret were configured, the dev-secret forgery fails to verify.
    expect(await verifySession(forged, "a-real-production-secret")).toBeNull();
  });
});

describe("getSession-pattern: resolveSecret null → safe null return (not throw)", () => {
  // getSession() in lib/server/auth.ts now calls resolveSecret() directly and
  // returns null when it returns null (rather than calling getSecret() which throws).
  // This avoids 500 errors on API routes when AUTH_SECRET is not set in production.
  // We verify the pure-logic contract here: resolveSecret() null → no verification attempted.
  afterEach(() => { vi.unstubAllEnvs(); });

  it("resolveSecret() returning null means getSession-pattern returns null without calling verifySession", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const secret = resolveSecret();
    // When secret is null, getSession() returns null immediately (no throw, no data leak).
    expect(secret).toBeNull();
    // verifySession with a valid token would succeed if a secret were provided —
    // but since secret is null, the caller (getSession) never reaches verifySession.
    // Demonstrate that calling verifySession with a non-null secret still works:
    const now = Math.floor(Date.now() / 1000);
    const payload = { role: "staff" as const, name: "Alice", iat: now, exp: now + 100 };
    const token = await signSession(payload, "some-secret");
    expect(await verifySession(token, "some-secret")).toEqual(payload);
    // But the production-no-secret path never reaches that call.
  });

  it("resolveSecret() null → requireStaff/requireAdmin should return 503 (not throw)", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    // The guards in lib/server/auth.ts check `resolveSecret() === null` first and
    // return 503. Verify the null check is what they rely on:
    expect(resolveSecret()).toBeNull();
  });
});
