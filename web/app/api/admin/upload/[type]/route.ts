import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const TOKEN = process.env.INTERNAL_GATEWAY_TOKEN;

const ALLOWED_TYPES = new Set(["menu-image", "maid-image"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const { type } = await params;

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Unknown upload type" }, { status: 400 });
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!image || !(image instanceof File)) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("image", image, image.name);

  const headers = new Headers();
  if (TOKEN) headers.set("x-internal-token", TOKEN);

  const url = `${BASE}/admin/uploads/${type}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: upstream,
    });
  } catch {
    return NextResponse.json({ error: "Upload service unavailable" }, { status: 502 });
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch { /* keep statusText */ }
    return NextResponse.json({ error: detail }, { status: res.status });
  }

  const data = (await res.json()) as { image_url: string };
  return NextResponse.json({ image_url: data.image_url });
}
