type DigestSignalLike = {
  signal_kind: string;
  signal_label: string;
  direction: "new" | "rising" | "sustained" | "cooling";
  raw_reach: number;
  supporting_items: number;
  independent_source_count: number;
  unique_action_count: number;
  metadata: Record<string, unknown> | null;
};

type ResearchNarrative = {
  why_now?: string | null;
  why_it_matters?: string | null;
  what_to_watch?: string | null;
} | null;

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function digestSummaryNumber(
  signal: Pick<DigestSignalLike, "metadata">,
  key: string,
  fallback: number,
) {
  const value = Number(object(signal.metadata?.summary)[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function digestCurrentReach(signal: DigestSignalLike) {
  return digestSummaryNumber(signal, "current_reach", Number(signal.raw_reach));
}

export function digestPreviousReach(signal: DigestSignalLike) {
  return digestSummaryNumber(signal, "previous_reach", 0);
}

export function digestSignalPassesHistoryGate(signal: DigestSignalLike) {
  if (signal.direction !== "sustained") return true;
  return signal.metadata?.has_twelve_complete_weeks === true &&
    Number(signal.metadata?.active_last_four_weeks ?? 0) >= 3;
}

export function digestSignalNarrative(
  signal: DigestSignalLike,
  research: ResearchNarrative = null,
) {
  const current = digestCurrentReach(signal) * 100;
  const previous = digestPreviousReach(signal) * 100;
  const items = digestSummaryNumber(signal, "current_items", signal.supporting_items);
  const sources = digestSummaryNumber(
    signal,
    "sources",
    signal.independent_source_count,
  );
  const actions = digestSummaryNumber(signal, "actions", signal.unique_action_count);
  const whyNow = nonEmpty(research?.why_now) ??
    `Now ${current.toFixed(1)}% of coverage, previously ${previous.toFixed(1)}%, supported by ${items} items across ${sources} independent sources${actions ? ` and ${actions} concrete actions` : ""}.`;

  let whyItMatters = `${signal.signal_label} is moving across independent sources, making it worth monitoring for a concrete decision or operational change.`;
  if (signal.signal_kind === "organization") {
    whyItMatters = `${signal.signal_label} is appearing more often in the evidence base, which can indicate a growing role in buying, funding, delivery, or partnership activity.`;
  } else if (signal.signal_kind === "system" || signal.signal_kind === "programme") {
    whyItMatters = actions
      ? `${signal.signal_label} is tied to real-world action, so the signal is moving beyond discussion toward execution.`
      : `${signal.signal_label} is gaining attention, but a buying, funding, testing, or deployment decision is still needed to confirm execution.`;
  } else if (signal.signal_kind === "keyword") {
    whyItMatters = `${signal.signal_label} is becoming more prominent in the language used across coverage and may reveal a narrower shift before a broad topic catches up.`;
  }

  return {
    whyNow,
    whyItMatters: nonEmpty(research?.why_it_matters) ?? whyItMatters,
    whatToWatch: nonEmpty(research?.what_to_watch) ?? (actions
      ? "Watch the next named buyer, contract value, delivery date, test result, or operational milestone."
      : "Watch for a primary-source announcement, named buyer, funding decision, trial, contract, or deployment."),
  };
}
