/**
 * i18n key coverage tests.
 *
 * Loads the REAL message files (not mocks) and asserts:
 *  (a) EN and ZH key sets are identical (deep, dotted paths).
 *  (b) Specific required keys exist in both — initially `customer.loading`,
 *      which was missing and caused MISSING_MESSAGE at runtime.
 *
 * Prevents the "added key only on one side" failure mode.
 */

import { describe, it, expect } from "vitest";
import en from "./en.json";
import zh from "./zh.json";

/** Recursively collect all leaf-and-branch keys as "a.b.c" strings. */
function deepKeys(
  obj: Record<string, unknown>,
  prefix = ""
): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    keys.add(full);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const sub of deepKeys(v as Record<string, unknown>, full)) {
        keys.add(sub);
      }
    }
  }
  return keys;
}

const enKeys = deepKeys(en as unknown as Record<string, unknown>);
const zhKeys = deepKeys(zh as unknown as Record<string, unknown>);

describe("i18n message files", () => {
  it("en.json and zh.json have identical key sets (deep)", () => {
    const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k));
    const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k));

    expect(onlyEn, `Keys present in en.json but missing from zh.json`).toEqual(
      []
    );
    expect(onlyZh, `Keys present in zh.json but missing from en.json`).toEqual(
      []
    );
  });

  it("customer.loading exists in en.json", () => {
    expect(
      enKeys.has("customer.loading"),
      "customer.loading is missing from en.json — t('loading') in OrderClient.tsx will throw MISSING_MESSAGE"
    ).toBe(true);
  });

  it("customer.loading exists in zh.json", () => {
    expect(
      zhKeys.has("customer.loading"),
      "customer.loading is missing from zh.json — t('loading') in OrderClient.tsx will throw MISSING_MESSAGE"
    ).toBe(true);
  });
});
