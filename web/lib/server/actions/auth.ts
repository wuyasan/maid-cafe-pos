"use server";
import { headers } from "next/headers";
import { createSession, clearSession } from "@/lib/server/auth";
import { api } from "@/lib/server/api-client";
import {
  shouldRateLimit,
  deriveRateLimitKey,
  type AttemptRecord,
} from "@/lib/server/rate-limit";

export type LoginErrorCode = "wrongPin" | "rateLimited" | "error";
export type LoginResult = { ok: true } | { ok: false; errorCode: LoginErrorCode };

// ─── Rate limiting ──────────────────────────────────────────────────────────
// In-memory sliding-window rate limiter. Single-instance only — across multiple
// replicas each node has its own counter. Acceptable for a single-server MVP;
// replace with Redis or an edge KV if horizontal scaling is needed.
//
// Key derivation: controlled by TRUST_PROXY_HEADERS env var (default OFF).
//   OFF (default/fail-safe): key = "role:global" — XFF is ignored entirely,
//     so an attacker cannot bypass limits by forging XFF values.
//   ON (set TRUST_PROXY_HEADERS=true): key = "role:<client-ip>" from XFF
//     leftmost entry — only safe when a trusted reverse proxy controls XFF.

const WINDOW_MS = 15 * 60 * 1000; // 15-minute window
const MAX_FAILURES = 10; // max failed attempts per key before cooldown

const _attempts = new Map<string, AttemptRecord>();

// Resolve once at module load; changing the env at runtime has no effect
// (intentional — avoids per-request env reads in a hot path).
const TRUST_PROXY = process.env.TRUST_PROXY_HEADERS === "true";

function recordFailure(key: string, now: number): void {
  const rec = _attempts.get(key);
  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    // Start a fresh window
    _attempts.set(key, { count: 1, windowStart: now });
  } else {
    rec.count += 1;
  }
}

function resetCounter(key: string): void {
  _attempts.delete(key);
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function loginAction(
  username: string,
  pin: string,
): Promise<LoginResult> {
  try {
    const uname = username.trim();
    const hdrs = await headers();
    const xff = hdrs.get("x-forwarded-for");
    // Rate-limit bucket scoped by username (the credential being brute-forced).
    const key = deriveRateLimitKey(uname.toLowerCase() || "anon", xff, TRUST_PROXY);
    const now = Date.now();

    if (shouldRateLimit(_attempts.get(key), now, WINDOW_MS, MAX_FAILURES)) {
      return { ok: false, errorCode: "rateLimited" };
    }

    let user;
    try {
      user = await api.staffLogin(uname, pin);
    } catch {
      // Any backend error (401 wrong creds, etc.) → treat as a failed attempt.
      recordFailure(key, now);
      return { ok: false, errorCode: "wrongPin" };
    }

    // Successful login — reset the counter for this key.
    resetCounter(key);
    await createSession({
      uid: user.id,
      username: user.username,
      name: user.display_name,
      role: user.role,
    });
    return { ok: true };
  } catch {
    return { ok: false, errorCode: "error" };
  }
}

export async function logoutAction(): Promise<void> {
  await clearSession();
}
