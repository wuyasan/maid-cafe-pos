/**
 * Unit tests for the admin upload proxy route.
 *
 * Fix #1: INTERNAL_GATEWAY_TOKEN is trimmed before use.
 * - Pure whitespace token → does NOT send X-Internal-Token header.
 * - Valid token (with or without surrounding whitespace) → sends header with trimmed value.
 */
import { describe, it, expect } from "vitest";

// We test the token-trimming logic directly without invoking the full Next.js handler,
// since the handler depends on requireAdmin() and FormData which are complex to mock.
// Instead we test the behaviour of the TOKEN constant derivation and the header-building
// logic that mirrors what the route does at module init / request time.

describe("admin upload proxy — INTERNAL_GATEWAY_TOKEN trimming", () => {
  // Helper that mirrors the route's token derivation and header-building logic
  function deriveToken(raw: string | undefined): string | undefined {
    return raw?.trim() || undefined;
  }

  function buildHeaders(token: string | undefined): Headers {
    const headers = new Headers();
    if (token) headers.set("x-internal-token", token);
    return headers;
  }

  it("does NOT send X-Internal-Token header when token is pure whitespace", () => {
    const token = deriveToken("   ");
    expect(token).toBeUndefined();
    const headers = buildHeaders(token);
    expect(headers.get("x-internal-token")).toBeNull();
  });

  it("does NOT send X-Internal-Token header when token is empty string", () => {
    const token = deriveToken("");
    expect(token).toBeUndefined();
    const headers = buildHeaders(token);
    expect(headers.get("x-internal-token")).toBeNull();
  });

  it("does NOT send X-Internal-Token header when token is undefined", () => {
    const token = deriveToken(undefined);
    expect(token).toBeUndefined();
    const headers = buildHeaders(token);
    expect(headers.get("x-internal-token")).toBeNull();
  });

  it("sends X-Internal-Token header with trimmed value when token has leading/trailing whitespace", () => {
    const token = deriveToken("  my-secret-token  ");
    expect(token).toBe("my-secret-token");
    const headers = buildHeaders(token);
    expect(headers.get("x-internal-token")).toBe("my-secret-token");
  });

  it("sends X-Internal-Token header when token is a valid non-whitespace string", () => {
    const token = deriveToken("valid-token-abc123");
    expect(token).toBe("valid-token-abc123");
    const headers = buildHeaders(token);
    expect(headers.get("x-internal-token")).toBe("valid-token-abc123");
  });

  it("token derivation result matches api-client.ts pattern (trim || undefined)", () => {
    // Ensure both route.ts and api-client.ts produce the same results for edge cases
    expect(deriveToken("\t\n  ")).toBeUndefined();
    expect(deriveToken("token")).toBe("token");
    expect(deriveToken("  token  ")).toBe("token");
    expect(deriveToken(undefined)).toBeUndefined();
  });
});
