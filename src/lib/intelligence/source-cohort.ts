export type IntelligenceSourceRow = Record<string, unknown>;

function object(value: unknown): IntelligenceSourceRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as IntelligenceSourceRow
    : {};
}

export function sourceIdFromDocument(
  document: IntelligenceSourceRow,
  identity: IntelligenceSourceRow,
) {
  return String(identity.source_id ?? object(document.metadata).source_id ?? "").trim();
}

export function isMeasurementDocument(input: {
  document: IntelligenceSourceRow;
  identity: IntelligenceSourceRow;
  source: IntelligenceSourceRow;
  publishedAt: string;
}) {
  const metadata = object(input.document.metadata);
  const cohort = String(input.source.cohort ?? metadata.source_cohort ?? "measurement");
  if (cohort !== "measurement") return false;
  if (input.source.id && input.source.status !== "active") return false;
  const activeFrom = typeof input.source.measurement_active_from === "string"
    ? input.source.measurement_active_from
    : null;
  return !activeFrom || input.publishedAt >= activeFrom;
}
