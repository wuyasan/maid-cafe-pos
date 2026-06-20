import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { nextDelay, useLiveQuery } from "./useLiveQuery";

describe("nextDelay", () => {
  it("uses base interval with no failures", () => {
    expect(nextDelay(0, 5000, 30000)).toBe(5000);
  });
  it("backs off exponentially per failure", () => {
    expect(nextDelay(1, 5000, 30000)).toBe(10000);
    expect(nextDelay(2, 5000, 30000)).toBe(20000);
  });
  it("caps at maxBackoffMs", () => {
    expect(nextDelay(10, 5000, 30000)).toBe(30000);
  });
});

describe("useLiveQuery (private, no key)", () => {
  it("populates data from the fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: 1 });
    const { result } = renderHook(() => useLiveQuery(fetcher, { intervalMs: 100000 }));
    await waitFor(() => expect(result.current.data).toEqual({ ok: 1 }));
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it("keeps last-good data and marks stale on error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useLiveQuery(fetcher, { intervalMs: 10 }));
    await waitFor(() => expect(result.current.data).toEqual({ v: 1 }));
    await waitFor(() => expect(result.current.isStale).toBe(true));
    expect(result.current.data).toEqual({ v: 1 }); // retained, not cleared
  });

  it("sets hasFetched to false initially, then true after first successful fetch", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: true });
    const { result } = renderHook(() => useLiveQuery(fetcher, { intervalMs: 100000 }));
    // Initially false before any fetch completes.
    expect(result.current.hasFetched).toBe(false);
    await waitFor(() => expect(result.current.hasFetched).toBe(true));
    expect(result.current.data).toEqual({ ready: true });
  });

  it("hasFetched stays false after a failed fetch", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useLiveQuery(fetcher, { intervalMs: 100000 }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.hasFetched).toBe(false);
  });
});

describe("useLiveQuery (shared key)", () => {
  // Use unique keys per test to avoid registry bleed-over.
  let key: string;
  beforeEach(() => {
    key = `test-key-${Math.random()}`;
  });

  it("both hooks receive the same data from a single shared fetch", async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      return { shared: true };
    });

    const { result: r1 } = renderHook(() =>
      useLiveQuery(fetcher, { key, intervalMs: 100000 }),
    );
    const { result: r2 } = renderHook(() =>
      useLiveQuery(fetcher, { key, intervalMs: 100000 }),
    );

    await waitFor(() => expect(r1.current.data).toEqual({ shared: true }));
    await waitFor(() => expect(r2.current.data).toEqual({ shared: true }));

    // The poller should have called fetcher only once (shared), not twice.
    expect(callCount).toBe(1);
  });

  it("hasFetched is true on both hooks after first shared fetch succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 42 });
    const { result: r1 } = renderHook(() =>
      useLiveQuery(fetcher, { key, intervalMs: 100000 }),
    );
    const { result: r2 } = renderHook(() =>
      useLiveQuery(fetcher, { key, intervalMs: 100000 }),
    );

    await waitFor(() => expect(r1.current.hasFetched).toBe(true));
    // Both hooks share the same snapshot so hasFetched propagates.
    await waitFor(() => expect(r2.current.hasFetched).toBe(true));
  });

  it("poller stops when last subscriber unmounts", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result: r1, unmount: u1 } = renderHook(() =>
      useLiveQuery(fetcher, { key, intervalMs: 100000 }),
    );
    const { unmount: u2 } = renderHook(() =>
      useLiveQuery(fetcher, { key, intervalMs: 100000 }),
    );

    await waitFor(() => expect(r1.current.data).toEqual({ x: 1 }));

    const callsBefore = fetcher.mock.calls.length;
    act(() => { u1(); });
    act(() => { u2(); });

    // After both unmount, fetcher should not be called again.
    await new Promise((res) => setTimeout(res, 50));
    expect(fetcher.mock.calls.length).toBe(callsBefore);
  });
});
