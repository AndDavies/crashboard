import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { INTELLIGENCE_EMBEDDING_MODEL } from "@/lib/intelligence/enrichment";
import {
  buildDailyMaintenanceContinuation,
  selectPendingDailyMaintenance,
} from "@/lib/intelligence/daily-maintenance-v2";
import { INTELLIGENCE_TERM_EXTRACTION_VERSION } from "@/lib/intelligence/term-observations";

describe("daily Intelligence v2 maintenance selection", () => {
  it("selects only missing or stale inputs and remains idempotent", () => {
    const pending = selectPendingDailyMaintenance({
      segments: [
        { id: "new", content_hash: "hash-c", updated_at: "2026-07-13T09:03:00Z" },
        { id: "covered", content_hash: "hash-a", updated_at: "2026-07-13T09:00:00Z" },
        { id: "stale", content_hash: "hash-new", updated_at: "2026-07-13T09:01:00Z" },
        { id: "zero", content_hash: "hash-zero", updated_at: "2026-07-13T09:02:00Z" },
      ],
      termStates: [
        {
          segment_id: "covered",
          content_hash: "hash-a",
          extraction_version: INTELLIGENCE_TERM_EXTRACTION_VERSION,
          observation_count: 4,
        },
        {
          segment_id: "stale",
          content_hash: "hash-old",
          extraction_version: INTELLIGENCE_TERM_EXTRACTION_VERSION,
          observation_count: 2,
        },
        {
          segment_id: "zero",
          content_hash: "hash-zero",
          extraction_version: INTELLIGENCE_TERM_EXTRACTION_VERSION,
          observation_count: 0,
        },
      ],
      segmentEmbeddings: [
        {
          segment_id: "covered",
          content_hash: "hash-a",
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
        },
        {
          segment_id: "stale",
          content_hash: "hash-old",
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
        },
        {
          segment_id: "zero",
          content_hash: "hash-zero",
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
        },
      ],
      concepts: [
        { id: "changed-concept", taxonomy_version: "v2", updated_at: "2026-07-13T09:02:00Z" },
        { id: "current-concept", taxonomy_version: "v1", updated_at: "2026-07-13T09:00:00Z" },
      ],
      conceptEmbeddings: [
        {
          concept_id: "current-concept",
          taxonomy_version: "v1",
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
        },
        {
          concept_id: "changed-concept",
          taxonomy_version: "v1",
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
        },
      ],
    });

    expect(pending).toEqual({
      termSegmentIds: ["stale", "new"],
      embeddingSegmentIds: ["stale", "new"],
      conceptIds: ["changed-concept"],
    });
  });

  it("returns no work when every current version is already present", () => {
    expect(selectPendingDailyMaintenance({
      segments: [{ id: "segment", content_hash: "hash", updated_at: "2026-07-13T09:00:00Z" }],
      termStates: [{
        segment_id: "segment",
        content_hash: "hash",
        extraction_version: INTELLIGENCE_TERM_EXTRACTION_VERSION,
        observation_count: 0,
      }],
      segmentEmbeddings: [{
        segment_id: "segment",
        content_hash: "hash",
        embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
      }],
      concepts: [{ id: "concept", taxonomy_version: "v1", updated_at: "2026-07-13T09:00:00Z" }],
      conceptEmbeddings: [{
        concept_id: "concept",
        taxonomy_version: "v1",
        embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
      }],
    })).toEqual({
      termSegmentIds: [],
      embeddingSegmentIds: [],
      conceptIds: [],
    });
  });

  it("keeps partial continuation on the same watermark and drains oldest work first", () => {
    const continuation = buildDailyMaintenanceContinuation({
      complete: false,
      since: "2026-07-12T09:00:00Z",
      deferred: { terms: 2, segmentEmbeddings: 1, conceptEmbeddings: 0 },
      segmentScanTruncated: false,
      conceptScanTruncated: false,
      segmentOffset: 20_000,
      conceptOffset: 5_000,
    });
    expect(continuation).toMatchObject({
      required: true,
      strategy: "oldest_unfinished_first",
      maintenanceSince: "2026-07-12T09:00:00Z",
      remaining: { terms: 2, segmentEmbeddings: 1, conceptEmbeddings: 0 },
      segmentOffset: 20_000,
      conceptOffset: 5_000,
    });
    expect(buildDailyMaintenanceContinuation({
      complete: true,
      since: "2026-07-12T09:00:00Z",
      deferred: { terms: 0, segmentEmbeddings: 0, conceptEmbeddings: 0 },
      segmentScanTruncated: false,
      conceptScanTruncated: false,
    })).toBeNull();
  });
});
