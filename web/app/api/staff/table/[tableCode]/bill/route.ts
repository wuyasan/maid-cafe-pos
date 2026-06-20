import { NextResponse } from "next/server";
import { api } from "@/lib/server/api-client";
import { requireStaff } from "@/lib/server/auth";

// Staff-side live bill endpoint — mirrors /api/customer/[tableCode]/bill but lives
// under /api/staff/ so it's clearly a staff-scoped fetch. Keeps api-client server-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tableCode: string }> },
) {
  const guard = await requireStaff();
  if (guard) return guard;

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
