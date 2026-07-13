import { describe, expect, it } from "vitest";
import {
  isMeasurementDocument,
  sourceIdFromDocument,
} from "@/lib/intelligence/source-cohort";

describe("Intelligence measurement cohort eligibility", () => {
  const document = {
    metadata: {
      source_id: "metadata-source",
      source_cohort: "measurement",
    },
  };

  it("requires an active measurement source and applies promotion prospectively", () => {
    const source = {
      id: "source",
      status: "active",
      cohort: "measurement",
      measurement_active_from: "2026-07-01T00:00:00.000Z",
    };
    expect(isMeasurementDocument({
      document,
      identity: {},
      source,
      publishedAt: "2026-07-01T00:00:00.000Z",
    })).toBe(true);
    expect(isMeasurementDocument({
      document,
      identity: {},
      source,
      publishedAt: "2026-06-30T23:59:59.999Z",
    })).toBe(false);
    expect(isMeasurementDocument({
      document,
      identity: {},
      source: { ...source, status: "paused" },
      publishedAt: "2026-07-02T00:00:00.000Z",
    })).toBe(false);
  });

  it("keeps research sources outside measurement and honours document metadata fallback", () => {
    expect(isMeasurementDocument({
      document,
      identity: {},
      source: { id: "research", status: "active", cohort: "research" },
      publishedAt: "2026-07-10T00:00:00.000Z",
    })).toBe(false);
    expect(isMeasurementDocument({
      document: { metadata: { source_cohort: "research" } },
      identity: {},
      source: {},
      publishedAt: "2026-07-10T00:00:00.000Z",
    })).toBe(false);
  });

  it("resolves the durable source before classifying a document", () => {
    expect(sourceIdFromDocument(document, { source_id: "identity-source" }))
      .toBe("identity-source");
    expect(sourceIdFromDocument(document, {})).toBe("metadata-source");
  });
});
