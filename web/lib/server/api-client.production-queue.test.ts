/**
 * The kitchen/bar production board renders a "completed/Done" column, so the
 * queue read MUST ask the backend for completed tasks — FastAPI excludes them
 * by default (include_completed=False). Regression guard for the bug:
 * "click Done → the item vanishes and the Done column stays empty".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// api-client imports getSession at module load; stub it so the import is clean
// (reads don't need a session).
vi.mock("@/lib/server/auth", () => ({ getSession: vi.fn().mockResolvedValue(null) }));

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ session_id: 1, session_name: "x", station: "kitchen", items: [] }),
})) as unknown as typeof fetch;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

function urlOf(call: number): string {
  return (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[call][0] as string;
}
function initOf(call: number): RequestInit {
  return (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[call][1] as RequestInit;
}

describe("getProductionQueue requests completed tasks", () => {
  it("kitchen queue is fetched with include_completed=true (no-store)", async () => {
    const { api } = await import("./api-client");
    await api.getProductionQueue("kitchen");
    expect(urlOf(0)).toContain("/staff/production/kitchen?include_completed=true");
    expect(initOf(0).cache).toBe("no-store");
  });

  it("bar queue is fetched with include_completed=true", async () => {
    const { api } = await import("./api-client");
    await api.getProductionQueue("bar");
    expect(urlOf(0)).toContain("/staff/production/bar?include_completed=true");
  });
});
