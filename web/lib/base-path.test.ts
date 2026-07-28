import { describe, expect, it } from "vitest";
import { BASE_PATH, withBasePath } from "./base-path";

describe("withBasePath", () => {
  it("uses the maid-cafe production mount by default", () => {
    expect(BASE_PATH).toBe("/maid-cafe");
  });

  it("prefixes same-origin absolute paths", () => {
    expect(withBasePath("/api/staff/tables")).toBe(
      "/maid-cafe/api/staff/tables",
    );
    expect(withBasePath("/uploads/menu-items/photo.webp")).toBe(
      "/maid-cafe/uploads/menu-items/photo.webp",
    );
  });

  it("does not double-prefix or rewrite external and relative URLs", () => {
    expect(withBasePath("/maid-cafe/login")).toBe("/maid-cafe/login");
    expect(withBasePath("https://cdn.example.com/photo.webp")).toBe(
      "https://cdn.example.com/photo.webp",
    );
    expect(withBasePath("photo.webp")).toBe("photo.webp");
  });
});
