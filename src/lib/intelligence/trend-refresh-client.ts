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
  rebuildRelationships?: boolean;
  startCursor?: number;
  waitBetweenBatches?: () => Promise<void>;
}) {
  let cursor = Math.max(0, Math.floor(input.startCursor ?? 0));
  let snapshotCount = 0;
  let total = 0;
  while (true) {
    const raw = await input.runBatch({
      cursor,
      limit: 1,
      rebuildRelationships: cursor === 0 && Boolean(input.rebuildRelationships),
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
    await input.waitBetweenBatches?.();
  }
  return { complete: cursor, total, snapshotCount };
}
