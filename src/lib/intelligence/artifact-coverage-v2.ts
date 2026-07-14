export type CurrentSegmentRow = {
  id: string;
  content_hash: string;
};

export type VersionedSegmentArtifactRow = {
  segment_id: string;
  content_hash: string;
};

/**
 * Counts only artifacts generated from the segment's current content. A stale
 * state row for the same stable segment ID must never make a backfill look
 * complete after re-segmentation changes the underlying text.
 */
export function currentSegmentArtifactCoverage(input: {
  segments: CurrentSegmentRow[];
  termStates: VersionedSegmentArtifactRow[];
  segmentEmbeddings: VersionedSegmentArtifactRow[];
}) {
  const termKeys = new Set(input.termStates.map((row) =>
    `${row.segment_id}|${row.content_hash}`
  ));
  const embeddingKeys = new Set(input.segmentEmbeddings.map((row) =>
    `${row.segment_id}|${row.content_hash}`
  ));
  const currentTermCount = input.segments.filter((row) =>
    termKeys.has(`${row.id}|${row.content_hash}`)
  ).length;
  const currentEmbeddingCount = input.segments.filter((row) =>
    embeddingKeys.has(`${row.id}|${row.content_hash}`)
  ).length;

  return {
    eligibleSegments: input.segments.length,
    currentTermCount,
    missingTerms: input.segments.length - currentTermCount,
    currentEmbeddingCount,
    missingEmbeddings: input.segments.length - currentEmbeddingCount,
  };
}
