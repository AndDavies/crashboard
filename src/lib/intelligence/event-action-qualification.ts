type DbRow = Record<string, unknown>;

export type EventPrincipalStrength = "strong" | "capability" | "organization";

export type EventPrincipal = {
  id: string;
  strength: EventPrincipalStrength;
  /** Canonical label used only to remove the shared principal's own words
   * from event-title corroboration. Identity continues to rely on the ID. */
  label?: string;
};

export function isGenericEventTitle(value: unknown) {
  return /\b(?:daily|weekly)\b.{0,80}\b(?:brief|roundup)\b|\bnews digest\b|\btop stories\b/iu
    .test(String(value ?? ""));
}

export function principalEntities(
  values: Array<{ id: string; type: string; role: string }>,
) {
  const strength = (value: {
    type: string;
    role: string;
  }): EventPrincipalStrength | null => {
    if (["program", "product_system"].includes(value.type)) return "strong";
    if (value.type === "capability_technology") return "capability";
    if (
      value.type === "government_agency" ||
      (value.type === "organization" && /buyer|customer|agency|operator|subject/iu.test(value.role))
    ) return "organization";
    return null;
  };
  const rank: Record<EventPrincipalStrength, number> = {
    strong: 3,
    capability: 2,
    organization: 1,
  };
  const principals = new Map<string, EventPrincipal>();
  for (const value of values) {
    const candidateStrength = strength(value);
    if (!candidateStrength) continue;
    const current = principals.get(value.id);
    if (!current || rank[candidateStrength] > rank[current.strength]) {
      principals.set(value.id, { id: value.id, strength: candidateStrength });
    }
  }
  return [...principals.values()].sort((a, b) =>
    rank[b.strength] - rank[a.strength] || a.id.localeCompare(b.id)
  );
}

export function principalEntity(
  values: Array<{ id: string; type: string; role: string }>,
) {
  return principalEntities(values)[0]?.id ?? null;
}

export function directEventPrincipals(
  rows: DbRow[],
  entityTypeById: Map<string, string>,
) {
  const valuesByEvent = new Map<
    string,
    Array<{ id: string; type: string; role: string }>
  >();
  for (const row of rows) {
    // Only event-specific extraction or manual review may establish identity.
    // Rule-derived document entities can describe unrelated newsletter items.
    const source = String(row.source ?? "model");
    if (!["model", "manual"].includes(source)) continue;
    const confidence = Number(row.confidence ?? 0);
    const extractionVersion = String(row.extraction_version ?? "").trim();
    const legacyDirectModel = source === "model" &&
      !extractionVersion && confidence >= 0.5;
    if (source !== "manual" && !legacyDirectModel && confidence < 0.65) continue;
    const metadata = row.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : {};
    if (metadata.inferred_from_evidence_document === true) continue;
    const eventId = String(row.event_id);
    const values = valuesByEvent.get(eventId) ?? [];
    values.push({
      id: String(row.entity_id),
      type: entityTypeById.get(String(row.entity_id)) ?? "",
      role: String(row.role ?? ""),
    });
    valuesByEvent.set(eventId, values);
  }
  return new Map(
    [...valuesByEvent].map(([eventId, values]) => [eventId, principalEntities(values)]),
  );
}

export type QualifyingActionExclusion =
  | "missing_date"
  | "future"
  | "low_confidence"
  | "generic_summary"
  | "invalid_procurement";

export function qualifyingActionExclusion(input: {
  event: DbRow;
  completeThrough: string;
  hasProcurementPrincipal: boolean;
}): QualifyingActionExclusion | null {
  const announced = String(input.event.announced_at ?? "").slice(0, 10);
  const occurred = String(input.event.occurred_at ?? "").slice(0, 10);
  if (!announced && !occurred) return "missing_date";
  if (
    (announced && announced > input.completeThrough) ||
    (occurred && occurred > input.completeThrough)
  ) return "future";
  if (Number(input.event.confidence ?? 0) < 0.6) return "low_confidence";
  if (isGenericEventTitle(input.event.title)) return "generic_summary";
  if (
    input.event.event_type === "procurement_notice" &&
    !input.hasProcurementPrincipal
  ) return "invalid_procurement";
  return null;
}

export function isQualifyingIntelligenceAction(input: {
  event: DbRow;
  completeThrough: string;
  hasProcurementPrincipal: boolean;
}) {
  return qualifyingActionExclusion(input) === null;
}
