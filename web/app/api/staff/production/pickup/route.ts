import { NextResponse } from "next/server";
import { api } from "@/lib/server/api-client";
import { requireStaff } from "@/lib/server/auth";

// Client-pollable pickup orders endpoint. Keeps api-client server-only.
export async function GET() {
  const guard = await requireStaff();
  if (guard) return guard;

  try {
    const result = await api.getPickupOrders();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
