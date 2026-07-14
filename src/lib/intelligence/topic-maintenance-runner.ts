export type ResumableTopicMaintenancePage = {
  hasMore: boolean;
  nextCursor: number | null;
  allowSameCursor?: boolean;
};

export type TopicMaintenancePageCheckpoint<T> = {
  page: number;
  cursor: number;
  resumeCursor: number | null;
  result: T;
};

function validDateOnly(value: unknown) {
  const candidate = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : undefined;
}

export function topicMaintenanceCronResume(input: {
  status: unknown;
  hasMore: unknown;
  nextCursor: unknown;
  windowStart: unknown;
}) {
  const windowStart = validDateOnly(input.windowStart);
  const nextCursor = input.nextCursor === null || input.nextCursor === undefined
    ? Number.NaN
    : Number(input.nextCursor);
  const resuming = ["partial", "failed", "running"].includes(String(input.status ?? "")) &&
    input.hasMore === true &&
    Number.isFinite(nextCursor) &&
    nextCursor >= 0 &&
    Boolean(windowStart);
  return {
    resuming,
    cursor: resuming ? Math.floor(nextCursor) : 0,
    windowStart: resuming ? windowStart : undefined,
  };
}

/**
 * Drains bounded topic-maintenance pages while durably checkpointing every
 * successful page. The first page always runs; later pages start only while
 * both the wall-time and page-count budgets remain.
 */
export async function drainTopicMaintenancePages<
  T extends ResumableTopicMaintenancePage,
>(options: {
  initialCursor?: number;
  deadlineAtMs: number;
  maxPages?: number;
  now?: () => number;
  runPage: (cursor: number) => Promise<T>;
  checkpoint: (value: TopicMaintenancePageCheckpoint<T>) => Promise<void>;
}) {
  const now = options.now ?? Date.now;
  const maxPages = Math.min(100, Math.max(1, Math.floor(options.maxPages ?? 60)));
  let cursor = Math.max(0, Math.floor(options.initialCursor ?? 0));
  let page = 0;
  let lastResult: T | null = null;
  let usedSameCursorPreparation = false;

  while (page < maxPages && (page === 0 || now() < options.deadlineAtMs)) {
    const result = await options.runPage(cursor);
    const nextCursor = result.hasMore ? Number(result.nextCursor) : null;
    const sameCursor = result.hasMore && nextCursor === cursor;
    if (result.hasMore &&
      (!Number.isFinite(nextCursor) || nextCursor === null || nextCursor < cursor ||
        (sameCursor &&
          (result.allowSameCursor !== true || usedSameCursorPreparation)))) {
      throw new Error(
        `Topic maintenance did not advance its cursor from ${cursor}.`,
      );
    }

    page += 1;
    await options.checkpoint({
      page,
      cursor,
      resumeCursor: nextCursor,
      result,
    });
    lastResult = result;
    if (!result.hasMore) break;
    usedSameCursorPreparation = sameCursor;
    cursor = nextCursor as number;
  }

  if (!lastResult) {
    throw new Error("Topic maintenance did not execute a page.");
  }
  return {
    result: lastResult,
    pagesProcessed: page,
    complete: !lastResult.hasMore,
    resumeCursor: lastResult.hasMore ? Number(lastResult.nextCursor) : null,
  };
}
