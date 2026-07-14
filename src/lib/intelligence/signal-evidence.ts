type SignalEvidenceRow = {
  metadata: {
    documentIds: string[];
    actionIds: string[];
    eventDedupGenerationId?: string | null;
  };
};

export type RecentSignalActionReference = {
  actionId: string;
  eventDedupGenerationId: string | null;
};

export function recentSignalEvidenceIds(
  signalRows: Map<string, SignalEvidenceRow[]>,
  selectedKeys: string[],
  field: "documentIds" | "actionIds",
  perSignalLimit = 12,
) {
  return new Map(selectedKeys.map((key) => [key, [
    ...new Set((signalRows.get(key) ?? []).slice(-28)
      .flatMap((row) => row.metadata[field])),
  ].reverse().slice(0, perSignalLimit)]));
}

export function recentSignalActionReferences(
  signalRows: Map<string, SignalEvidenceRow[]>,
  selectedKeys: string[],
  perSignalLimit = 12,
) {
  return new Map(selectedKeys.map((key) => {
    const seen = new Set<string>();
    const references: RecentSignalActionReference[] = [];
    for (const row of (signalRows.get(key) ?? []).slice(-28).reverse()) {
      const generationId = row.metadata.eventDedupGenerationId ?? null;
      for (const actionId of [...row.metadata.actionIds].reverse()) {
        const identity = `${generationId ?? "legacy"}:${actionId}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        references.push({ actionId, eventDedupGenerationId: generationId });
        if (references.length >= perSignalLimit) break;
      }
      if (references.length >= perSignalLimit) break;
    }
    return [key, references] as const;
  }));
}
