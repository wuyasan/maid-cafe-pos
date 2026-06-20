import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/server/api-client";
import { requireAdmin } from "@/lib/server/auth";

// Client-pollable admin session-maids endpoint. Keeps api-client server-only.
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  try {
    const result = await api.getAdminSessionMaids(Number(sessionId));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
