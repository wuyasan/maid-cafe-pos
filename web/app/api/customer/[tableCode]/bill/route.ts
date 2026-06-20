import { NextResponse } from "next/server";
import { api } from "@/lib/server/api-client";

// Client-pollable live bill endpoint (useLiveQuery hits this). Keeps api-client server-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tableCode: string }> },
) {
  const { tableCode } = await params;
  try {
    const bill = await api.getTableBill(tableCode);
    return NextResponse.json(bill);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
