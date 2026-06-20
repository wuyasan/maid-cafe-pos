import { NextResponse } from "next/server";
import { api } from "@/lib/server/api-client";
import { requireStaff } from "@/lib/server/auth";

// Client-pollable production queue endpoint.
// Usage: GET /api/staff/production/queue?station=kitchen  or  ?station=bar
export async function GET(req: Request) {
  const guard = await requireStaff();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const station = searchParams.get("station");
  if (station !== "kitchen" && station !== "bar") {
    return NextResponse.json({ error: "station must be kitchen or bar" }, { status: 400 });
  }
  try {
    const result = await api.getProductionQueue(station);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
