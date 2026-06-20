// USD money formatting. Backend returns decimal amounts as strings; format consistently.
// Currency is USD per project decision (see CLAUDE.md / rebuild spec).
export function formatUSD(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
