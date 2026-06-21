import { describe, it, expect } from "vitest";
import { maidServiceUnitPrice } from "./maidPricing";
import type { MenuItem } from "./types";

// Mirrors backend pricing_service.calculate_order_item_price:
//   unit = base + (selected - 1) * additional, capped at all_maids_price
//   only when ALL on-duty maids are selected.

function maidItem(
  base: string,
  additional: string | null,
  cap: string | null,
): MenuItem {
  const pricing =
    additional == null && cap == null
      ? null
      : { additional_maid_price: additional ?? "0.00", all_maids_price: cap };
  return {
    id: 1,
    name: "Cheki",
    description: null,
    price: base,
    image_url: null,
    category_id: 1,
    item_type: "maid_service",
    is_bundle: false,
    maid_service_pricing: pricing,
  } as MenuItem;
}

const regular = {
  id: 2,
  name: "Tea",
  description: null,
  price: "5.00",
  image_url: null,
  category_id: 1,
  item_type: "regular",
  is_bundle: false,
} as MenuItem;

describe("maidServiceUnitPrice", () => {
  it("regular item → base price (ignores maid count)", () => {
    expect(maidServiceUnitPrice(regular, 0, 7)).toBe(5);
  });

  it("1 maid → base price", () => {
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 1, 7)).toBe(8);
  });

  it("2 maids → base + 1×additional", () => {
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 2, 7)).toBe(13);
  });

  it("3 maids → base + 2×additional", () => {
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 3, 7)).toBe(18);
  });

  it("ALL on-duty maids selected → capped at all_maids_price", () => {
    // 7 maids: 8 + 6×5 = 38, cap 30 → 30
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 7, 7)).toBe(30);
  });

  it("all selected but counted below cap → counted (min wins)", () => {
    // total 2: 8 + 1×5 = 13, cap 30 → 13
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 2, 2)).toBe(13);
  });

  it("cap only applies when selected == total available (not a partial)", () => {
    // 6 of 7 selected: 8 + 5×5 = 33, cap 30 but NOT all → 33 (no cap)
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 6, 7)).toBe(33);
  });

  it("no cap configured → never capped", () => {
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", null), 7, 7)).toBe(38);
  });

  it("0 maids selected (preview before picking) → base", () => {
    expect(maidServiceUnitPrice(maidItem("8.00", "5.00", "30.00"), 0, 7)).toBe(8);
  });

  it("maid item missing pricing config → base", () => {
    expect(maidServiceUnitPrice(maidItem("8.00", null, null), 2, 7)).toBe(8);
  });
});
