import type { IntelligenceSignalKind } from "@/lib/intelligence/signals-v2-types";

export type SignalKeyCandidate = {
  key: string;
  id: string;
  label: string;
};

export function signalKindForConceptType(value: unknown): IntelligenceSignalKind {
  if (value === "capability") return "system";
  if (value === "keyword") return "keyword";
  return "topic";
}

export function signalKindForEntityType(value: unknown): IntelligenceSignalKind | null {
  if (value === "organization" || value === "government_agency") return "organization";
  if (value === "program") return "programme";
  if (value === "product_system" || value === "capability_technology") return "system";
  return null;
}

export function conceptSignalKey(id: unknown, conceptType: unknown) {
  const stableId = String(id ?? "").trim();
  return stableId ? `${signalKindForConceptType(conceptType)}:${stableId}` : null;
}

export function entitySignalKey(id: unknown, entityType: unknown) {
  const stableId = String(id ?? "").trim();
  const kind = signalKindForEntityType(entityType);
  return stableId && kind ? `${kind}:${stableId}` : null;
}

function normalizedLookup(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-CA")
    .replace(/[^a-z0-9]+/gu, " ").trim();
}

export function resolveRequestedSignalKey(
  requested: string,
  candidates: SignalKeyCandidate[],
) {
  const value = requested.trim();
  if (!value) return null;
  const exactKey = candidates.find((candidate) => candidate.key === value);
  if (exactKey) return exactKey.key;

  const legacyPrefix = value.match(/^(?:concept|entity):(.+)$/u);
  const stableId = legacyPrefix?.[1] ?? value;
  const exactId = candidates.find((candidate) => candidate.id === stableId);
  if (exactId) return exactId.key;

  const normalized = normalizedLookup(value);
  const labelMatch = candidates.find((candidate) => normalizedLookup(candidate.label) === normalized);
  return labelMatch?.key ?? null;
}
