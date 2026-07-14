export const INTELLIGENCE_ANALYSIS_PHASES = [
  { phase: "segmentation", label: "Separating newsletter stories", limit: 25 },
  { phase: "terms", label: "Measuring exact terms", limit: 100 },
  { phase: "embeddings", label: "Preparing evidence search", limit: 25 },
  { phase: "concept_embeddings", label: "Preparing topic matching", limit: 25 },
  { phase: "topic_maintenance", label: "Discovering stable topics", limit: 400 },
  { phase: "dedupe", label: "Grouping repeated stories", limit: 1 },
  { phase: "signals", label: "Calculating trend lines", limit: 250 },
] as const;

export type IntelligenceAnalysisPhase = typeof INTELLIGENCE_ANALYSIS_PHASES[number]["phase"];

export function isIntelligenceAnalysisPhase(value: unknown): value is IntelligenceAnalysisPhase {
  return INTELLIGENCE_ANALYSIS_PHASES.some((definition) => definition.phase === value);
}

export function savedSignalRefreshWindow(
  checkpoint: Record<string, unknown> | null,
  result: Record<string, unknown> | null,
) {
  const nested = result?.signals && typeof result.signals === "object"
    ? result.signals as Record<string, unknown>
    : result;
  const candidate = String(
    checkpoint?.signal_complete_through
      ?? checkpoint?.completeThrough
      ?? nested?.completeThrough
      ?? "",
  ).slice(0, 10);
  const history = Number(checkpoint?.signal_history_days ?? 395);
  return {
    completeThrough: /^\d{4}-\d{2}-\d{2}$/u.test(candidate) ? candidate : undefined,
    historyDays: Number.isFinite(history)
      ? Math.min(730, Math.max(112, Math.floor(history)))
      : 395,
  };
}

export function savedTopicMaintenanceResume(
  checkpoint: Record<string, unknown> | null,
  result: Record<string, unknown> | null,
) {
  const rawNextCursor = checkpoint?.nextCursor;
  const nextCursor = rawNextCursor === null || rawNextCursor === undefined
    ? Number.NaN
    : Number(rawNextCursor);
  const candidateWindow = String(
    checkpoint?.topic_window_start ?? result?.windowStart ?? "",
  ).trim().slice(0, 10);
  const parsedWindow = /^\d{4}-\d{2}-\d{2}$/u.test(candidateWindow)
    ? new Date(`${candidateWindow}T00:00:00.000Z`)
    : null;
  const windowStart = parsedWindow && Number.isFinite(parsedWindow.getTime()) &&
      parsedWindow.toISOString().slice(0, 10) === candidateWindow
    ? candidateWindow
    : undefined;
  const resuming = checkpoint?.phase === "topic_maintenance" &&
    checkpoint.hasMore === true &&
    Number.isFinite(nextCursor) &&
    nextCursor >= 0 &&
    Boolean(windowStart);
  return {
    resuming,
    cursor: resuming ? Math.floor(nextCursor) : 0,
    windowStart: resuming ? windowStart : undefined,
  };
}

const phaseIndex = new Map(
  INTELLIGENCE_ANALYSIS_PHASES.map((definition, index) => [definition.phase, index]),
);

export function analysisPhasePrecedesCheckpoint(
  requested: IntelligenceAnalysisPhase,
  checkpoint: unknown,
) {
  const requestedIndex = phaseIndex.get(requested);
  const checkpointIndex = phaseIndex.get(checkpoint as IntelligenceAnalysisPhase);
  return requestedIndex !== undefined && checkpointIndex !== undefined &&
    requestedIndex < checkpointIndex;
}

export function analysisProcessedCount(
  result: Record<string, unknown>,
  phase: IntelligenceAnalysisPhase,
) {
  const nested = result[phase];
  const phaseResult = nested && typeof nested === "object"
    ? nested as Record<string, unknown>
    : {};
  const value = result.processed ?? result.scanned ??
    result.processedCandidateTermCount ??
    phaseResult.processed ?? phaseResult.scanned ??
    phaseResult.processedCandidateTermCount ?? 0;
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}
