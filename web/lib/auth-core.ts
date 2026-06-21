// Pure crypto helpers — NO server-only, NO next/* imports.
// Safe for Edge runtime (middleware) and Node runtime (server components) and vitest.

export type StaffRole = "staff" | "manager" | "admin";

export type SessionPayload = {
  /** Staff-user id. Optional for backward compatibility with legacy role-only cookies. */
  uid?: number;
  /** Login username. Optional for backward compatibility with legacy role-only cookies. */
  username?: string;
  name: string;
  role: StaffRole;
  iat: number;
  exp: number;
};

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  // Use btoa + Uint8Array — works in Node 16+, Edge, and vitest
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a payload; returns a 3-part dot-delimited token. */
export async function signSession(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const header = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256" })),
  );
  const body = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${toBase64Url(sig)}`;
}

/** Verify token; returns payload or null (bad sig, expired, malformed). */
export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sig),
      new TextEncoder().encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const payload: SessionPayload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body)),
    );
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Resolve the HMAC signing secret. Returns null when it cannot be resolved
 * safely (production with AUTH_SECRET unset) so every caller FAILS CLOSED —
 * we never fall back to a public dev constant in production (a forged
 * dev-secret cookie must not be verifiable). Dev/test fall back to the dev
 * constant. This is the single source of truth shared by proxy + server auth.
 */
export function resolveSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-secret-change-me";
}

/** Verify a PIN against env vars; dev fallback with console.warn. */
export function verifyPin(role: "staff" | "admin", pin: string): boolean {
  const isProd = process.env.NODE_ENV === "production";

  if (role === "staff") {
    const envPin = process.env.STAFF_PIN;
    if (!envPin) {
      if (isProd) {
        // Fail-closed in production: refuse login rather than fall back to a known PIN.
        return false;
      }
      console.warn("[auth] STAFF_PIN is not set — using dev fallback '1234'.");
      return pin === "1234";
    }
    return pin === envPin;
  }
  const envPin = process.env.ADMIN_PIN;
  if (!envPin) {
    if (isProd) {
      // Fail-closed in production: refuse login rather than fall back to a known PIN.
      return false;
    }
    console.warn("[auth] ADMIN_PIN is not set — using dev fallback '9999'.");
    return pin === "9999";
  }
  return pin === envPin;
}
