/**
 * api-client write verbs must stamp X-Actor-Id / X-Actor-Role from the session
 * so F2 audit covers ALL writes (menu / sessions / tables / production / …),
 * not only staff-user mutations. Reads must NOT carry actor headers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Session resolved by currentActor() → drives X-Actor-* headers.
const mockGetSession = vi.fn();
vi.mock("@/lib/server/auth", () => ({
  getSession: () => mockGetSession(),
}));

// Capture fetch calls; return a benign JSON 200.
const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({}),
})) as unknown as typeof fetch;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mockGetSession.mockResolvedValue({ uid: 7, role: "manager" });
});

async function headersOf(call: number): Promise<Headers> {
  const args = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[call];
  return (args[1] as RequestInit).headers as Headers;
}

describe("api-client write verbs stamp actor headers", () => {
  it("postJson (createCategory) carries X-Actor-Id / X-Actor-Role", async () => {
    const { api } = await import("./api-client");
    await api.createCategory({ name: "x" } as never);
    const h = await headersOf(0);
    expect(h.get("x-actor-id")).toBe("7");
    expect(h.get("x-actor-role")).toBe("manager");
  });

  it("patchJson (updateMenuItem) carries actor headers", async () => {
    const { api } = await import("./api-client");
    await api.updateMenuItemWithPricing(3, {} as never);
    const h = await headersOf(0);
    expect(h.get("x-actor-id")).toBe("7");
    expect(h.get("x-actor-role")).toBe("manager");
  });

  it("putJson (setSessionMaidAvailability) carries actor headers", async () => {
    const { api } = await import("./api-client");
    await api.setSessionMaidAvailability(1, 2, true);
    const h = await headersOf(0);
    expect(h.get("x-actor-id")).toBe("7");
    expect(h.get("x-actor-role")).toBe("manager");
  });

  it("deleteReq (deleteTable) carries actor headers", async () => {
    const { api } = await import("./api-client");
    await api.deleteTable(9);
    const h = await headersOf(0);
    expect(h.get("x-actor-id")).toBe("7");
    expect(h.get("x-actor-role")).toBe("manager");
  });

  it("reads (getStaffUsers) do NOT carry actor headers", async () => {
    const { api } = await import("./api-client");
    await api.getStaffUsers();
    const h = await headersOf(0);
    expect(h.get("x-actor-id")).toBeNull();
    expect(h.get("x-actor-role")).toBeNull();
  });

  it("omits actor headers when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const { api } = await import("./api-client");
    await api.createCategory({ name: "x" } as never);
    const h = await headersOf(0);
    expect(h.get("x-actor-id")).toBeNull();
    expect(h.get("x-actor-role")).toBeNull();
  });
});
