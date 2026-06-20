"use client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/** Pure: next poll delay with exponential backoff after failures, capped. */
export function nextDelay(failures: number, intervalMs: number, maxBackoffMs: number): number {
  if (failures <= 0) return intervalMs;
  return Math.min(intervalMs * 2 ** failures, maxBackoffMs);
}

export interface LiveQueryState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  /** true when the latest fetch failed but we're still showing the last-good data */
  isStale: boolean;
  /** true once at least one fetch has succeeded */
  hasFetched: boolean;
  refetch: () => void;
}

export interface LiveQueryOptions {
  intervalMs?: number;
  enabled?: boolean;
  maxBackoffMs?: number;
  /** Shared-poller key: all hooks with the same key share one polling loop + cache */
  key?: string;
}

// ── Shared-poller registry ────────────────────────────────────────────────────

interface PollerSnapshot {
  data: unknown;
  error: Error | null;
  isLoading: boolean;
  isStale: boolean;
  hasFetched: boolean;
}

type Listener = () => void;

interface PollerEntry {
  snapshot: PollerSnapshot;
  listeners: Set<Listener>;
  fetcher: () => Promise<unknown>;
  intervalMs: number;
  maxBackoffMs: number;
  alive: boolean;
  failures: number;
  timer: ReturnType<typeof setTimeout> | null;
  refetchToken: number;
}

const registry = new Map<string, PollerEntry>();

function notifyAll(entry: PollerEntry) {
  entry.listeners.forEach((fn) => fn());
}

function setSnapshot(entry: PollerEntry, patch: Partial<PollerSnapshot>) {
  entry.snapshot = { ...entry.snapshot, ...patch };
  notifyAll(entry);
}

async function runPoller(entry: PollerEntry): Promise<void> {
  if (!entry.alive) return;
  setSnapshot(entry, { isLoading: true });
  try {
    const result = await entry.fetcher();
    if (!entry.alive) return;
    entry.failures = 0;
    setSnapshot(entry, { data: result, error: null, isStale: false, hasFetched: true, isLoading: false });
  } catch (e) {
    if (!entry.alive) return;
    entry.failures += 1;
    setSnapshot(entry, {
      error: e instanceof Error ? e : new Error(String(e)),
      isStale: true,
      isLoading: false,
    });
  }
  if (!entry.alive) return;
  if (typeof document !== "undefined" && document.hidden) return;
  scheduleNext(entry);
}

function scheduleNext(entry: PollerEntry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    void runPoller(entry);
  }, nextDelay(entry.failures, entry.intervalMs, entry.maxBackoffMs));
}

function startSharedPoller(key: string, fetcher: () => Promise<unknown>, intervalMs: number, maxBackoffMs: number): PollerEntry {
  const existing = registry.get(key);
  if (existing) {
    // Update fetcher/options in case they changed (latest subscriber wins for config).
    existing.fetcher = fetcher;
    existing.intervalMs = intervalMs;
    existing.maxBackoffMs = maxBackoffMs;
    return existing;
  }
  const entry: PollerEntry = {
    snapshot: { data: null, error: null, isLoading: false, isStale: false, hasFetched: false },
    listeners: new Set(),
    fetcher,
    intervalMs,
    maxBackoffMs,
    alive: true,
    failures: 0,
    timer: null,
    refetchToken: 0,
  };
  registry.set(key, entry);
  void runPoller(entry);
  return entry;
}

function stopSharedPoller(key: string) {
  const entry = registry.get(key);
  if (!entry) return;
  entry.alive = false;
  if (entry.timer) clearTimeout(entry.timer);
  registry.delete(key);
}

function triggerRefetch(entry: PollerEntry) {
  entry.refetchToken += 1;
  if (entry.timer) clearTimeout(entry.timer);
  void runPoller(entry);
}

// ── Visibility / pageshow handlers (shared, registered once per key) ──────────

const visibilityHandlers = new Map<string, () => void>();
const pageshowHandlers = new Map<string, (e: PageTransitionEvent) => void>();

function ensureWindowHandlers(key: string) {
  if (typeof document === "undefined") return;

  if (!visibilityHandlers.has(key)) {
    const onVis = () => {
      const entry = registry.get(key);
      if (!entry) return;
      if (document.hidden) {
        if (entry.timer) clearTimeout(entry.timer);
      } else {
        void runPoller(entry);
      }
    };
    visibilityHandlers.set(key, onVis);
    document.addEventListener("visibilitychange", onVis);
  }

  if (!pageshowHandlers.has(key)) {
    const onPageshow = (e: PageTransitionEvent) => {
      if (!e.persisted) return; // only bfcache restores
      const entry = registry.get(key);
      if (!entry) return;
      void runPoller(entry);
    };
    pageshowHandlers.set(key, onPageshow);
    window.addEventListener("pageshow", onPageshow);
  }
}

function removeWindowHandlers(key: string) {
  const vis = visibilityHandlers.get(key);
  if (vis) {
    document.removeEventListener("visibilitychange", vis);
    visibilityHandlers.delete(key);
  }
  const ps = pageshowHandlers.get(key);
  if (ps) {
    window.removeEventListener("pageshow", ps);
    pageshowHandlers.delete(key);
  }
}

// ── Private per-instance poller (no key) ─────────────────────────────────────
// Uses a ref-based approach so useSyncExternalStore can be used consistently.

/**
 * Client-side polling for live data (floor / kitchen / runner / bill status).
 * - polls at intervalMs; pauses when the tab is hidden, resumes on visibilitychange + pageshow
 * - on error: keeps last-good data, marks stale, backs off exponentially
 * - key?: multiple hooks with the same key share one poller + cache (dedup requests)
 * - hasFetched: true once at least one fetch succeeded
 * This is the single seam — swap to SSE/WS later without touching screens.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  opts: LiveQueryOptions = {},
): LiveQueryState<T> {
  const { intervalMs = 5000, enabled = true, maxBackoffMs = 30000, key } = opts;

  if (key) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSharedLiveQuery<T>(fetcher, { intervalMs, enabled, maxBackoffMs, key });
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return usePrivateLiveQuery<T>(fetcher, { intervalMs, enabled, maxBackoffMs });
}

// ── Shared-key variant ────────────────────────────────────────────────────────

function useSharedLiveQuery<T>(
  fetcher: () => Promise<T>,
  opts: Required<Omit<LiveQueryOptions, "key">> & { key: string },
): LiveQueryState<T> {
  const { intervalMs, enabled, maxBackoffMs, key } = opts;

  // Keep latest fetcher ref so poller always calls the newest closure.
  const fetcherRef = useRef<() => Promise<T>>(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Stable fetcher wrapper for the shared entry.
  const stableFetcher = useCallback(() => fetcherRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    startSharedPoller(key, stableFetcher as () => Promise<unknown>, intervalMs, maxBackoffMs);
    ensureWindowHandlers(key);

    return () => {
      // If this is the last subscriber, stop the poller.
      if (registry.get(key)?.listeners.size === 0) {
        stopSharedPoller(key);
        removeWindowHandlers(key);
      }
    };
  }, [enabled, intervalMs, maxBackoffMs, key, stableFetcher]);

  const subscribe = useCallback(
    (cb: Listener) => {
      const entry = registry.get(key);
      if (entry) entry.listeners.add(cb);
      return () => {
        const e = registry.get(key);
        if (e) {
          e.listeners.delete(cb);
          if (e.listeners.size === 0) {
            stopSharedPoller(key);
            removeWindowHandlers(key);
          }
        }
      };
    },
    [key],
  );

  const getSnapshot = useCallback((): PollerSnapshot => {
    return registry.get(key)?.snapshot ?? { data: null, error: null, isLoading: false, isStale: false, hasFetched: false };
  }, [key]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refetch = useCallback(() => {
    const entry = registry.get(key);
    if (entry) triggerRefetch(entry);
  }, [key]);

  return {
    data: snapshot.data as T | null,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    isStale: snapshot.isStale,
    hasFetched: snapshot.hasFetched,
    refetch,
  };
}

// ── Private (no-key) variant ──────────────────────────────────────────────────

interface PrivateState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isStale: boolean;
  hasFetched: boolean;
  version: number;
}

function usePrivateLiveQuery<T>(
  fetcher: () => Promise<T>,
  opts: Required<Omit<LiveQueryOptions, "key">>,
): LiveQueryState<T> {
  const { intervalMs, enabled, maxBackoffMs } = opts;

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // State stored in a ref for useSyncExternalStore.
  const stateRef = useRef<PrivateState<T>>({
    data: null,
    error: null,
    isLoading: false,
    isStale: false,
    hasFetched: false,
    version: 0,
  });
  const listenersRef = useRef(new Set<Listener>());

  const notify = useCallback(() => {
    listenersRef.current.forEach((fn) => fn());
  }, []);

  const patchState = useCallback(
    (patch: Partial<Omit<PrivateState<T>, "version">>) => {
      stateRef.current = { ...stateRef.current, ...patch, version: stateRef.current.version + 1 };
      notify();
    },
    [notify],
  );

  // Ref for refetch trigger so the effect can observe it without re-running.
  const refetchTriggerRef = useRef(0);
  // Expose a stable refetch that increments the trigger and kicks the loop.
  const runRef = useRef<(() => void) | null>(null);

  const refetch = useCallback(() => {
    refetchTriggerRef.current += 1;
    runRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    function clear() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    async function run() {
      if (!alive) return;
      patchState({ isLoading: true });
      try {
        const result = await fetcherRef.current();
        if (!alive) return;
        failures = 0;
        patchState({ data: result, error: null, isStale: false, hasFetched: true, isLoading: false });
      } catch (e) {
        if (!alive) return;
        failures += 1;
        patchState({ error: e instanceof Error ? e : new Error(String(e)), isStale: true, isLoading: false });
      }
      if (!alive) return;
      if (typeof document !== "undefined" && document.hidden) return;
      clear();
      timer = setTimeout(() => { void run(); }, nextDelay(failures, intervalMs, maxBackoffMs));
    }

    // Expose run so refetch() can kick it.
    runRef.current = () => { clear(); void run(); };

    function onVisibility() {
      if (typeof document !== "undefined" && document.hidden) clear();
      else void run();
    }

    function onPageshow(e: PageTransitionEvent) {
      if (e.persisted) void run();
    }

    void run();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageshow);

    return () => {
      alive = false;
      runRef.current = null;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageshow);
    };
  }, [enabled, intervalMs, maxBackoffMs, patchState]);

  const subscribe = useCallback((cb: Listener) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    data: snapshot.data,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    isStale: snapshot.isStale,
    hasFetched: snapshot.hasFetched,
    refetch,
  };
}
