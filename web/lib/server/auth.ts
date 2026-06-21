import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signSession, verifySession, verifyPin, resolveSecret } from "@/lib/auth-core";
import type { SessionPayload } from "@/lib/auth-core";

export type { SessionPayload };
export { signSession, verifySession, verifyPin };

function getSecret(): string {
  const s = resolveSecret();
  if (!s) {
    // Fail-hard in production: never use a known fallback secret.
    throw new Error(
      "[auth] AUTH_SECRET is not set. This environment variable is required in production.",
    );
  }
  if (!process.env.AUTH_SECRET) {
    console.warn(
      "[auth] AUTH_SECRET is not set — using insecure dev constant. Set AUTH_SECRET in production.",
    );
  }
  return s;
}

const COOKIE_NAME = "mc_session";
const MAX_AGE = 43200; // 12 hours

/** Create a signed session and write the httpOnly cookie. */
export async function createSession(
  role: "staff" | "admin",
  name: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { role, name, iat: now, exp: now + MAX_AGE };
  const token = await signSession(payload, getSecret());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
  });
}

/** Read and verify the session cookie. Returns null if absent, invalid, or AUTH_SECRET is not configured. */
export async function getSession(): Promise<SessionPayload | null> {
  const secret = resolveSecret();
  if (!secret) return null;
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token, secret);
}

/** Delete the session cookie. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Guard for any authenticated staff/admin session.
 * Returns a 503 NextResponse if AUTH_SECRET is not configured,
 * a 401 NextResponse if not authenticated, or null if OK.
 * Usage in route handlers:
 *   const guard = await requireStaff();
 *   if (guard) return guard;
 */
export async function requireStaff(): Promise<NextResponse | null> {
  if (resolveSecret() === null) {
    return NextResponse.json({ error: "Server auth not configured" }, { status: 503 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Guard for admin-only routes.
 * Returns a 503 NextResponse if AUTH_SECRET is not configured,
 * a 401 NextResponse if not authenticated, 403 if not admin, or null if OK.
 * Usage in route handlers:
 *   const guard = await requireAdmin();
 *   if (guard) return guard;
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (resolveSecret() === null) {
    return NextResponse.json({ error: "Server auth not configured" }, { status: 503 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Server Action guard for any authenticated staff/admin session.
 * Returns the session if valid, null otherwise.
 * Usage inside a Server Action:
 *   const s = await assertStaffAction();
 *   if (!s) return { ok: false, error: "Unauthorized" };
 */
export async function assertStaffAction(): Promise<SessionPayload | null> {
  return getSession();
}

/**
 * Server Action guard for admin-only Server Actions.
 * Returns the session if the caller is an authenticated admin, null otherwise.
 * Usage inside a Server Action:
 *   const s = await assertAdminAction();
 *   if (!s) return { ok: false, error: "Unauthorized" };
 */
export async function assertAdminAction(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}
