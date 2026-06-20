import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveSecret, verifySession } from "@/lib/auth-core";

const PROTECTED = ["/staff", "/admin"];
const COOKIE_NAME = "mc_session";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Check if this path requires authentication
  const needsAuth = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const secret = resolveSecret();
  if (!secret) {
    // Production without AUTH_SECRET: fail CLOSED. Never verify against a public
    // dev constant — a forged dev-secret cookie must not grant access.
    console.error(
      "[proxy] AUTH_SECRET is not set in production — denying all protected routes (fail-closed).",
    );
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const session = await verifySession(token, secret);
    if (session) {
      // Enforce role: /admin requires admin role
      if (pathname.startsWith("/admin") && session.role !== "admin") {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      return NextResponse.next();
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - /api routes (handled by Next API route handlers)
     * - /order (public customer ordering)
     * - /login (the login page itself)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|api/|order/|login).*)",
  ],
};
