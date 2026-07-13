import { describe, expect, it } from "vitest";
import {
  catalogMatchHref,
  procurementEventProfileHref,
} from "@/lib/intelligence/catalog-profile";

describe("intelligence catalog profile links", () => {
  it("opens a buying opportunity at its most recent linked event evidence profile", () => {
    const profileHref = procurementEventProfileHref([
      { event_id: "event-old", transition_at: "2026-06-01T12:00:00Z" },
      { event_id: "event-current", transition_at: "2026-07-01T12:00:00Z" },
    ]);
    expect(profileHref).toBe("/dashboard/intelligence/events/event-current");
    expect(catalogMatchHref({
      id: "buying_opportunity:case-1",
      kind: "buying_opportunity",
      profileHref,
    }, "W847A")).toBe("/dashboard/intelligence/events/event-current");
  });

  it("never treats a buying opportunity without an event as a trend signal", () => {
    expect(procurementEventProfileHref([])).toBeNull();
    expect(catalogMatchHref({
      id: "buying_opportunity:case-1",
      kind: "buying_opportunity",
    }, "W847A")).toBe("/dashboard/intelligence/explore?q=W847A");
  });
});
