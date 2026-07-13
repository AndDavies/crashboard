type SignalEvidenceRow = {
  metadata: {
    documentIds: string[];
    actionIds: string[];
  };
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
