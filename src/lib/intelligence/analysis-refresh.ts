export const INTELLIGENCE_ANALYSIS_PHASES = [
  { phase: "segmentation", label: "Separating newsletter stories", limit: 25 },
  { phase: "terms", label: "Measuring exact terms", limit: 100 },
  { phase: "embeddings", label: "Preparing evidence search", limit: 25 },
  { phase: "concept_embeddings", label: "Preparing topic matching", limit: 25 },
  { phase: "topic_maintenance", label: "Discovering stable topics", limit: 400 },
  { phase: "dedupe", label: "Grouping repeated stories", limit: 1 },
  { phase: "signals", label: "Calculating trend lines", limit: 1 },
] as const;

export type IntelligenceAnalysisPhase = typeof INTELLIGENCE_ANALYSIS_PHASES[number]["phase"];

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
