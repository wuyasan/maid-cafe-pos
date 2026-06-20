import { describe, it, expect } from "vitest";
import { formatUSD } from "./money";

describe("formatUSD", () => {
  it("formats integer dollars", () => {
    expect(formatUSD(68)).toBe("$68.00");
  });
  it("formats decimal strings (the backend wire shape)", () => {
    expect(formatUSD("194.5")).toBe("$194.50");
  });
  it("rounds to two decimals", () => {
    expect(formatUSD(3.005)).toBe("$3.01");
  });
  it("falls back to $0.00 on invalid input", () => {
    expect(formatUSD("abc")).toBe("$0.00");
  });
});
