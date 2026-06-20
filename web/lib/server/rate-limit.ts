/**
 * Pure, side-effect-free rate-limit utilities.
 *
 * Separated from the "use server" actions file so they can be imported by tests
 * without triggering the Next.js Server Action constraint (all exports async).
 *
 * NOTE (production): the in-memory Map used by the caller is single-instance.
 * In a multi-replica deployment, move the store to shared storage (Redis, Edge
 * KV, etc.) so all nodes share the same counters.
 */
export interface AttemptRecord {
  count: number;
  windowStart: number;
}

/**
 * Returns true if the request should be rate-limited.
 *
 * @param record   The current sliding-window record for this key (or undefined if none).
 * @param now      Current timestamp in milliseconds.
 * @param windowMs Length of the sliding window in milliseconds.
 * @param maxFail  Maximum allowed failures within the window before rate-limiting.
 */
export function shouldRateLimit(
  record: AttemptRecord | undefined,
  now: number,
  windowMs: number,
  maxFail: number,
): boolean {
  if (!record) return false;
  // If the window has expired, the counter has effectively reset.
  if (now - record.windowStart >= windowMs) return false;
  return record.count >= maxFail;
}

/**
 * Derives the rate-limit bucket key for a login attempt.
 *
 * Security model
 * ──────────────
 * X-Forwarded-For (XFF) is a client-controlled header when there is no
 * trusted reverse proxy stripping/overwriting it. An attacker can cycle
 * arbitrary XFF values to mint new buckets and bypass per-IP limits.
 *
 * Two modes, selected by the TRUST_PROXY_HEADERS env var:
 *
 *   TRUST_PROXY_HEADERS=true  — deployed behind a controlled reverse proxy
 *     (e.g. nginx, Cloudflare, Railway) that overwrites / prepends XFF with
 *     the real client IP. We trust the leftmost entry as the client IP and
 *     key by "role:ip". Different real IPs get independent buckets.
 *
 *   TRUST_PROXY_HEADERS unset / false  (DEFAULT, fail-safe)
 *     Ignore XFF entirely. Key by "role" only, creating one global bucket per
 *     role. Forging XFF values cannot mint new buckets. Trade-off: a single
 *     bucket covers all clients for that role, but brute-force is still
 *     capped. Acceptable for a single-server MVP with a known small staff.
 *
 * @param role         "staff" | "admin"
 * @param xff          Raw value of the x-forwarded-for header (may be null).
 * @param trustProxy   Whether to trust the XFF header (from TRUST_PROXY_HEADERS).
 */
export function deriveRateLimitKey(
  role: string,
  xff: string | null,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    // Take the leftmost entry of XFF as the client IP.
    // Assumption: the trusted proxy prepends the real IP; any entries to the
    // right are from outer proxies already verified by the reverse-proxy chain.
    const clientIp = xff?.split(",")[0]?.trim() ?? "unknown";
    return `${role}:${clientIp}`;
  }

  // Default (fail-safe): global per-role bucket. XFF is ignored completely, so
  // rotating XFF values cannot produce new buckets or bypass the limit.
  return `${role}:global`;
}
