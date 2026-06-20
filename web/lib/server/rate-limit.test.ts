import { describe, it, expect } from "vitest";
import { shouldRateLimit, deriveRateLimitKey } from "@/lib/server/rate-limit";
import type { AttemptRecord } from "@/lib/server/rate-limit";

// shouldRateLimit(record, now, windowMs, maxFail)

const WINDOW = 15 * 60 * 1000; // 15 minutes in ms
const MAX = 10;
const NOW = 1_700_000_000_000; // arbitrary fixed timestamp

describe("shouldRateLimit", () => {
  it("returns false when there is no record at all (undefined)", () => {
    expect(shouldRateLimit(undefined, NOW, WINDOW, MAX)).toBe(false);
  });

  it("returns false when count is below the limit within the window", () => {
    const record: AttemptRecord = { count: MAX - 1, windowStart: NOW - 1000 };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(false);
  });

  it("returns true when count equals the limit within the window", () => {
    const record: AttemptRecord = { count: MAX, windowStart: NOW - 1000 };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(true);
  });

  it("returns true when count exceeds the limit within the window", () => {
    const record: AttemptRecord = { count: MAX + 5, windowStart: NOW - 1000 };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(true);
  });

  it("returns false when the window has exactly expired (elapsed === windowMs)", () => {
    // elapsed = NOW - (NOW - WINDOW) = WINDOW, so condition `>= windowMs` is true → not limited
    const record: AttemptRecord = { count: MAX, windowStart: NOW - WINDOW };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(false);
  });

  it("returns false when the window has expired (elapsed > windowMs)", () => {
    const record: AttemptRecord = { count: MAX + 100, windowStart: NOW - WINDOW - 1 };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(false);
  });

  it("returns true when count is at limit and window has NOT yet expired", () => {
    // One millisecond before expiry
    const record: AttemptRecord = { count: MAX, windowStart: NOW - WINDOW + 1 };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(true);
  });

  it("returns false for a fresh window (windowStart === now, count below max)", () => {
    const record: AttemptRecord = { count: 1, windowStart: NOW };
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(false);
  });

  it("respects custom maxFail thresholds — boundary at exactly maxFail", () => {
    const record: AttemptRecord = { count: 3, windowStart: NOW - 1000 };
    expect(shouldRateLimit(record, NOW, WINDOW, 3)).toBe(true);
    expect(shouldRateLimit(record, NOW, WINDOW, 4)).toBe(false);
  });

  it("respects a shorter custom windowMs — expired for short window, active for long", () => {
    const shortWindow = 5000; // 5 seconds
    const record: AttemptRecord = { count: MAX, windowStart: NOW - 6000 };
    // 6 s ago — window expired for 5 s window
    expect(shouldRateLimit(record, NOW, shortWindow, MAX)).toBe(false);
    // But still within the 15-minute window
    expect(shouldRateLimit(record, NOW, WINDOW, MAX)).toBe(true);
  });
});

describe("deriveRateLimitKey", () => {
  // ── trust OFF (default / fail-safe) ─────────────────────────────────────

  it("trust OFF: returns a global-per-role key regardless of XFF value", () => {
    expect(deriveRateLimitKey("staff", "1.2.3.4", false)).toBe("staff:global");
    expect(deriveRateLimitKey("admin", "10.0.0.1", false)).toBe("admin:global");
  });

  it("trust OFF: forged XFF values map to the same key — bypass is impossible", () => {
    // Attacker sends two different XFF values hoping to get two separate buckets.
    const key1 = deriveRateLimitKey("staff", "1.1.1.1", false);
    const key2 = deriveRateLimitKey("staff", "2.2.2.2", false);
    // Both must collide in the same bucket — forging XFF gains nothing.
    expect(key1).toBe(key2);
  });

  it("trust OFF: null XFF still maps to the global key", () => {
    expect(deriveRateLimitKey("staff", null, false)).toBe("staff:global");
  });

  it("trust OFF: different roles produce different global keys", () => {
    const staffKey = deriveRateLimitKey("staff", "1.2.3.4", false);
    const adminKey = deriveRateLimitKey("admin", "1.2.3.4", false);
    expect(staffKey).not.toBe(adminKey);
  });

  // ── trust ON (reverse-proxy deployment) ──────────────────────────────────

  it("trust ON: different real IPs produce different keys", () => {
    const key1 = deriveRateLimitKey("staff", "1.1.1.1", true);
    const key2 = deriveRateLimitKey("staff", "2.2.2.2", true);
    expect(key1).not.toBe(key2);
  });

  it("trust ON: picks the leftmost IP from a multi-hop XFF header", () => {
    // Proxy chain: real client at 1.2.3.4, then two intermediate hops.
    const key = deriveRateLimitKey("staff", "1.2.3.4, 10.0.0.1, 172.16.0.1", true);
    expect(key).toBe("staff:1.2.3.4");
  });

  it("trust ON: null XFF falls back to 'unknown' without throwing", () => {
    expect(deriveRateLimitKey("staff", null, true)).toBe("staff:unknown");
  });

  it("trust ON: whitespace around IPs in XFF is trimmed", () => {
    expect(deriveRateLimitKey("admin", "  3.3.3.3 , 4.4.4.4", true)).toBe(
      "admin:3.3.3.3",
    );
  });

  // ── success-reset integration (pure-function perspective) ─────────────────

  it("same key is produced for consecutive requests from the same source", () => {
    // Ensures resetCounter(key) after login will hit the same bucket.
    const k1 = deriveRateLimitKey("staff", "5.5.5.5", true);
    const k2 = deriveRateLimitKey("staff", "5.5.5.5", true);
    expect(k1).toBe(k2);
  });
});
