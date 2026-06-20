// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getSquareConfig,
  saveSquareRuntimeConfig,
  buildSquarePosUrl,
  savePendingCheckout,
  readPendingCheckout,
  clearPendingCheckout,
  SQUARE_PENDING_CHECKOUT_KEY,
  SQUARE_RUNTIME_CONFIG_KEY,
} from "./squarePos";

// Node 26 stubs window.localStorage with a broken placeholder that requires
// --localstorage-file. We replace it with a real in-memory implementation so
// the squarePos helpers (which use window.localStorage) work in tests.
function makeLocalStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() { return Object.keys(store).length; },
    key(i: number) { return Object.keys(store)[i] ?? null; },
    getItem(k: string) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k: string, v: string) { store[k] = String(v); },
    removeItem(k: string) { delete store[k]; },
    clear() { store = {}; },
  };
}

const mockLocalStorage = makeLocalStorageMock();

beforeEach(() => {
  vi.stubGlobal("localStorage", mockLocalStorage);
  mockLocalStorage.clear();
  // squarePos reads window.localStorage, so stub window too.
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
  delete process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
  delete process.env.NEXT_PUBLIC_SQUARE_CALLBACK_URL;
  delete process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
});

afterEach(() => {
  mockLocalStorage.clear();
  vi.unstubAllGlobals();
});

describe("getSquareConfig", () => {
  it("throws when applicationId is absent", () => {
    expect(() => getSquareConfig()).toThrow(/Application ID/);
  });

  it("throws when callbackUrl is absent even if applicationId is set", () => {
    mockLocalStorage.setItem(
      SQUARE_RUNTIME_CONFIG_KEY,
      JSON.stringify({ applicationId: "sq0idp-test" }),
    );
    expect(() => getSquareConfig()).toThrow(/callback URL/i);
  });

  it("reads config from localStorage", () => {
    mockLocalStorage.setItem(
      SQUARE_RUNTIME_CONFIG_KEY,
      JSON.stringify({
        applicationId: "sq0idp-abc",
        callbackUrl: "https://example.com/callback",
        locationId: "LOC123",
      }),
    );
    const cfg = getSquareConfig();
    expect(cfg.applicationId).toBe("sq0idp-abc");
    expect(cfg.callbackUrl).toBe("https://example.com/callback");
    expect(cfg.locationId).toBe("LOC123");
  });

  it("env vars take priority over localStorage", () => {
    mockLocalStorage.setItem(
      SQUARE_RUNTIME_CONFIG_KEY,
      JSON.stringify({
        applicationId: "local-id",
        callbackUrl: "https://local.example.com/callback",
      }),
    );
    process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID = "env-id";
    process.env.NEXT_PUBLIC_SQUARE_CALLBACK_URL = "https://env.example.com/callback";

    const cfg = getSquareConfig();
    expect(cfg.applicationId).toBe("env-id");
    expect(cfg.callbackUrl).toBe("https://env.example.com/callback");
  });

  it("locationId is optional — undefined when absent", () => {
    mockLocalStorage.setItem(
      SQUARE_RUNTIME_CONFIG_KEY,
      JSON.stringify({
        applicationId: "sq0idp-x",
        callbackUrl: "https://example.com/cb",
      }),
    );
    const cfg = getSquareConfig();
    expect(cfg.locationId).toBeUndefined();
  });
});

describe("saveSquareRuntimeConfig", () => {
  it("persists config to localStorage", () => {
    saveSquareRuntimeConfig({
      applicationId: "sq0idp-save",
      callbackUrl: "https://example.com/save",
      locationId: "LOC_SAVE",
    });
    const raw = mockLocalStorage.getItem(SQUARE_RUNTIME_CONFIG_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.applicationId).toBe("sq0idp-save");
    expect(parsed.locationId).toBe("LOC_SAVE");
  });
});

describe("buildSquarePosUrl", () => {
  beforeEach(() => {
    mockLocalStorage.setItem(
      SQUARE_RUNTIME_CONFIG_KEY,
      JSON.stringify({
        applicationId: "sq0idp-build",
        callbackUrl: "https://example.com/callback",
        locationId: "LOC_BUILD",
      }),
    );
  });

  it("starts with the expected scheme prefix", () => {
    const url = buildSquarePosUrl({ total: "12.50", tableCode: "A1", billId: 7 });
    expect(url).toMatch(/^square-commerce-v1:\/\/payment\/create\?data=/);
  });

  it("encodes amount in cents", () => {
    const url = buildSquarePosUrl({ total: "12.50", tableCode: "A1", billId: 7 });
    const data = JSON.parse(decodeURIComponent(url.split("data=")[1]));
    expect(data.amount_money.amount).toBe("1250");
    expect(data.amount_money.currency_code).toBe("USD");
  });

  it("embeds tableCode and billId in state", () => {
    const url = buildSquarePosUrl({ total: "5.00", tableCode: "B2", billId: 99 });
    const data = JSON.parse(decodeURIComponent(url.split("data=")[1]));
    const state = JSON.parse(data.state);
    expect(state.tableCode).toBe("B2");
    expect(state.billId).toBe(99);
  });

  it("uses v1.3", () => {
    const url = buildSquarePosUrl({ total: "1.00", tableCode: "C3", billId: 1 });
    const data = JSON.parse(decodeURIComponent(url.split("data=")[1]));
    expect(data.version).toBe("1.3");
  });

  it("sets callback_url from config", () => {
    const url = buildSquarePosUrl({ total: "1.00", tableCode: "C3", billId: 1 });
    const data = JSON.parse(decodeURIComponent(url.split("data=")[1]));
    expect(data.callback_url).toBe("https://example.com/callback");
  });

  it("throws on zero total", () => {
    expect(() =>
      buildSquarePosUrl({ total: "0", tableCode: "A1", billId: 1 }),
    ).toThrow(/greater than zero/);
  });

  it("throws on NaN total", () => {
    expect(() =>
      buildSquarePosUrl({ total: "abc", tableCode: "A1", billId: 1 }),
    ).toThrow(/greater than zero/);
  });
});

describe("pending checkout helpers", () => {
  it("savePendingCheckout stores and readPendingCheckout retrieves", () => {
    const pending = {
      tableCode: "T1",
      billId: 42,
      total: "25.00",
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    savePendingCheckout(pending);
    const retrieved = readPendingCheckout();
    expect(retrieved).toEqual(pending);
  });

  it("readPendingCheckout returns null when nothing stored", () => {
    expect(readPendingCheckout()).toBeNull();
  });

  it("clearPendingCheckout removes the entry", () => {
    savePendingCheckout({
      tableCode: "T2",
      billId: 1,
      total: "10.00",
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    clearPendingCheckout();
    expect(mockLocalStorage.getItem(SQUARE_PENDING_CHECKOUT_KEY)).toBeNull();
  });
});
