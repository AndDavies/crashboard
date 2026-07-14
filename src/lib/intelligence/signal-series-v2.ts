import type { CanonicalSignalDailyRow } from "@/lib/intelligence/signal-metrics-v2";
import type { IntelligenceSignalSeriesPoint } from "@/lib/intelligence/signals-v2-types";

const DAY_MS = 86_400_000;

function addDays(value: string, days: number) {
  return new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function buildSignalSeriesForRange(input: {
  rows: CanonicalSignalDailyRow[];
  totals: Map<string, { items: number; tokens: number }>;
  start: string;
  end: string;
  daily: boolean;
}) {
  const byDate = new Map(input.rows.map((row) => [row.signalDate, row]));
  const buckets = new Map<string, CanonicalSignalDailyRow[]>();
  const eligibleByBucket = new Map<string, { items: number; tokens: number }>();
  for (let date = input.start, index = 0; date <= input.end; date = addDays(date, 1), index += 1) {
    const bucket = input.daily ? date : addDays(input.start, Math.floor(index / 7) * 7);
    const row = byDate.get(date);
    if (row) {
      const rows = buckets.get(bucket) ?? [];
      rows.push(row);
      buckets.set(bucket, rows);
    }
    const total = eligibleByBucket.get(bucket) ?? { items: 0, tokens: 0 };
    const dayTotal = input.totals.get(date);
    total.items += dayTotal?.items ?? 0;
    total.tokens += dayTotal?.tokens ?? 0;
    eligibleByBucket.set(bucket, total);
  }
  return [...eligibleByBucket.entries()].filter(([, total]) => total.items > 0)
    .map(([date, total]): IntelligenceSignalSeriesPoint => {
      const rows = buckets.get(date) ?? [];
      const support = rows.reduce((sum, row) => sum + row.supportingItems, 0);
      const mentions = rows.reduce((sum, row) => sum + row.mentionCount, 0);
      return {
        date,
        shareOfCoverage: 100 * support / Math.max(1, total.items),
        items: support,
        stories: new Set(rows.flatMap((row) => row.metadata.storyIds)).size,
        sources: new Set(rows.flatMap((row) => row.metadata.sourceFamilies)).size,
        actions: new Set(rows.flatMap((row) => row.metadata.actionIds)).size,
        mentionsPer10k: 10_000 * mentions / Math.max(1, total.tokens),
      };
    });
}
