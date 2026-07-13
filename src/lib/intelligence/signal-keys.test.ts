import { describe, expect, it } from "vitest";
import {
  conceptSignalKey,
  entitySignalKey,
  resolveRequestedSignalKey,
} from "@/lib/intelligence/signal-keys";

const candidates = [
  { key: "topic:concept-1", id: "concept-1", label: "Counter UAS" },
  { key: "organization:entity-1", id: "entity-1", label: "Department of National Defence" },
];

describe("canonical intelligence signal keys", () => {
  it("maps stored concept and entity types to canonical v2 keys", () => {
    expect(conceptSignalKey("concept-1", "theme")).toBe("topic:concept-1");
    expect(conceptSignalKey("concept-2", "capability")).toBe("system:concept-2");
    expect(entitySignalKey("entity-1", "government_agency")).toBe("organization:entity-1");
    expect(entitySignalKey("entity-2", "program")).toBe("programme:entity-2");
    expect(entitySignalKey("entity-3", "person")).toBeNull();
  });

  it("resolves canonical, legacy deep-link, raw ID, and normalized-label requests", () => {
    expect(resolveRequestedSignalKey("topic:concept-1", candidates)).toBe("topic:concept-1");
    expect(resolveRequestedSignalKey("concept:concept-1", candidates)).toBe("topic:concept-1");
    expect(resolveRequestedSignalKey("entity-1", candidates)).toBe("organization:entity-1");
    expect(resolveRequestedSignalKey("counter-uas", candidates)).toBe("topic:concept-1");
    expect(resolveRequestedSignalKey("missing", candidates)).toBeNull();
  });
});
