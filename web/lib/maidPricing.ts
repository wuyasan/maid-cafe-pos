import type { MenuItem } from "@/lib/types";

/**
 * Preview a maid-service item's UNIT price, mirroring the backend
 * `pricing_service.calculate_order_item_price`:
 *
 *   unit = base + (selectedCount - 1) * additional_maid_price
 *   capped at all_maids_price ONLY when ALL on-duty maids are selected.
 *
 * Non-maid items, or maid items with no maids picked yet, return the base price.
 * Display-only: the backend remains authoritative for the actual charge.
 */
export function maidServiceUnitPrice(
  item: MenuItem,
  selectedCount: number,
  totalAvailableMaids: number,
): number {
  const base = Number(item.price) || 0;
  if (item.item_type !== "maid_service" || selectedCount <= 0) return base;

  const pricing = item.maid_service_pricing;
  const additional = Number(pricing?.additional_maid_price ?? 0) || 0;
  let unit = base + (selectedCount - 1) * additional;

  const cap = pricing?.all_maids_price;
  const capNum = Number(cap);
  if (
    cap != null &&
    Number.isFinite(capNum) &&
    totalAvailableMaids > 0 &&
    selectedCount === totalAvailableMaids
  ) {
    unit = Math.min(unit, capNum);
  }
  return unit;
}
