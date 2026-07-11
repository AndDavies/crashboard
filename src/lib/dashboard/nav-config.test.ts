import { describe, expect, it } from "vitest";
import { findNavTitleForPath, getDashboardBreadcrumbs } from "@/lib/dashboard/nav-config";

describe("dashboard intelligence navigation", () => {
  it("uses the most specific route for trend detail pages", () => {
    expect(findNavTitleForPath("/dashboard/intelligence/trends/concept%3A1")).toBe("Trends");
  });

  it("does not repeat Overview for every nested breadcrumb", () => {
    expect(
      getDashboardBreadcrumbs("/dashboard/intelligence/documents/abc").map((item) => item.label),
    ).toEqual(["Dashboard", "Overview", "Documents", "Abc"]);
  });
});
