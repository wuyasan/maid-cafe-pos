import { describe, expect, it } from "vitest";
import { BASE_PATH, withBasePath } from "./base-path";

describe("withBasePath", () => {
  it("uses the subdomain root by default", () => {
    expect(BASE_PATH).toBe("");
  });

  it("keeps same-origin absolute paths at the subdomain root", () => {
    expect(withBasePath("/api/staff/tables")).toBe("/api/staff/tables");
    expect(withBasePath("/uploads/menu-items/photo.webp")).toBe(
      "/uploads/menu-items/photo.webp",
    );
  });

  it("does not rewrite external and relative URLs", () => {
    expect(withBasePath("https://cdn.example.com/photo.webp")).toBe(
      "https://cdn.example.com/photo.webp",
    );
    expect(withBasePath("photo.webp")).toBe("photo.webp");
  });
});
