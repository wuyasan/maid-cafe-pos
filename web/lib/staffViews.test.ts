/**
 * Tests for visibleStaffViews — the single source of truth that gates the Admin
 * view to admins. Shared by the staff home tile grid (StaffHomePage) and the
 * sidebar (StaffShell) so the two never diverge.
 */
import { describe, it, expect } from "vitest";
import { STAFF_VIEWS, visibleStaffViews } from "./staffViews";

const ids = (role: Parameters<typeof visibleStaffViews>[0]) =>
  visibleStaffViews(role).map((v) => v.id);

describe("visibleStaffViews — Admin gating", () => {
  it("includes the admin view for an admin", () => {
    expect(ids("admin")).toContain("admin");
    // admin sees every registered view
    expect(visibleStaffViews("admin")).toHaveLength(STAFF_VIEWS.length);
  });

  it("excludes the admin view for a manager", () => {
    expect(ids("manager")).not.toContain("admin");
  });

  it("excludes the admin view for staff", () => {
    expect(ids("staff")).not.toContain("admin");
  });

  it("excludes the admin view when role is null/undefined", () => {
    expect(ids(null)).not.toContain("admin");
    expect(ids(undefined)).not.toContain("admin");
  });

  it("keeps all non-admin views for every role", () => {
    const nonAdmin = STAFF_VIEWS.filter((v) => v.id !== "admin").map((v) => v.id);
    for (const role of ["staff", "manager", null, undefined] as const) {
      expect(ids(role)).toEqual(nonAdmin);
    }
  });
});
