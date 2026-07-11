export type TrendRefreshBatch = {
  snapshotCount: number;
  nextWindowOffset: number;
  totalWindowCount: number;
  hasMore: boolean;
};

export type TrendRefreshProgress = {
  complete: number;
  total: number;
  snapshotCount: number;
};

export async function runBatchedTrendRefresh(input: {
  runBatch: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onProgress?: (progress: TrendRefreshProgress) => void;
}) {
  let cursor = 0;
  let snapshotCount = 0;
  let total = 0;
  while (true) {
    const raw = await input.runBatch({
      cursor,
      limit: 1,
      rebuildRelationships: cursor === 0,
    });
    const batch: TrendRefreshBatch = {
      snapshotCount: Number(raw.snapshotCount ?? 0),
      nextWindowOffset: Number(raw.nextWindowOffset ?? cursor + 1),
      totalWindowCount: Number(raw.totalWindowCount ?? cursor + 1),
      hasMore: Boolean(raw.hasMore),
    };
    if (batch.nextWindowOffset <= cursor) {
      throw new Error("Trend refresh did not advance its saved window checkpoint.");
    }
    cursor = batch.nextWindowOffset;
    total = batch.totalWindowCount;
    snapshotCount += batch.snapshotCount;
    input.onProgress?.({ complete: cursor, total, snapshotCount });
    if (!batch.hasMore) break;
  }
  return { complete: cursor, total, snapshotCount };
}
