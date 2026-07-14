export const NO_OPENAI_FLAG = "--no-openai";
export const LEGACY_CODEX_TOPIC_REVIEW_FLAG = "--codex-review-topics";
export const PAID_OPENAI_CONFIRMATION_FLAG = "--allow-paid-openai";

export type LocalEmbeddingCoverage = {
  eligibleSegments: number;
  embeddedSegments: number;
  embeddingsComplete: boolean;
  concepts: number;
  embeddedConcepts: number;
  conceptEmbeddingsComplete: boolean;
};

export function requestsNoOpenAi(args: string[]) {
  return args.includes(NO_OPENAI_FLAG) ||
    args.includes(LEGACY_CODEX_TOPIC_REVIEW_FLAG) ||
    !args.includes(PAID_OPENAI_CONFIRMATION_FLAG);
}

export function assertCompatibleLocalOpenAiFlags(args: string[]) {
  const explicitlyDisabled = args.includes(NO_OPENAI_FLAG) ||
    args.includes(LEGACY_CODEX_TOPIC_REVIEW_FLAG);
  if (explicitlyDisabled && args.includes(PAID_OPENAI_CONFIRMATION_FLAG)) {
    throw new Error(
      `${PAID_OPENAI_CONFIRMATION_FLAG} cannot be combined with ${NO_OPENAI_FLAG} or ` +
      `${LEGACY_CODEX_TOPIC_REVIEW_FLAG}.`,
    );
  }
}

export function disableOpenAiApiForLocalRun(
  environment: Record<string, string | undefined> = process.env,
) {
  delete environment.OPENAI_API_KEY;
  // CODEX_API_KEY overrides the explicitly selected Codex authentication or
  // provider. Zero-API review must use saved ChatGPT access or local Ollama,
  // never an inherited usage-billed credential.
  delete environment.CODEX_API_KEY;
}

/**
 * Paid research is intentionally opt-in for the local manual CLI. Scheduled
 * production research has its own feature flag and budget controls and does
 * not use this policy helper.
 */
export function assertPaidOpenAiCliConfirmation(args: string[]) {
  if (args.includes(PAID_OPENAI_CONFIRMATION_FLAG)) return;

  throw new Error(
    "Manual Intelligence research can make paid OpenAI API calls and is disabled by default. " +
    `Re-run with ${PAID_OPENAI_CONFIRMATION_FLAG} only when that spend is intentional, ` +
    "or use --help for the complete command. Scheduled production research is unchanged.",
  );
}

/**
 * Local analysis can reuse current production-compatible vectors, but it must
 * never silently move past a missing API-backed embedding phase.
 */
export function assertNoOpenAiEmbeddingCoverage(
  coverage: LocalEmbeddingCoverage,
  options: { requireConcepts?: boolean } = {},
) {
  const missingSegments = Math.max(
    0,
    coverage.eligibleSegments - coverage.embeddedSegments,
  );
  const missingConcepts = Math.max(
    0,
    coverage.concepts - coverage.embeddedConcepts,
  );
  const problems: string[] = [];
  if (!coverage.embeddingsComplete || missingSegments > 0) {
    problems.push(`${missingSegments} current segment embedding(s)`);
  }
  if (
    options.requireConcepts !== false &&
    (!coverage.conceptEmbeddingsComplete || missingConcepts > 0)
  ) {
    problems.push(`${missingConcepts} current concept embedding(s)`);
  }
  if (!problems.length) return;

  throw new Error(
    `${NO_OPENAI_FLAG} cannot continue because ${problems.join(" and ")} are missing. ` +
    "Complete the API-backed embedding phase first, then retry the local run.",
  );
}
