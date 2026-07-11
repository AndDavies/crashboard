import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestCompleteDateKey, shiftDateKey } from "@/lib/intelligence/signal-metrics";
import { normalizeConceptKey } from "@/lib/intelligence/concepts";

const PROCUREMENT_STAGE_ORDER = [
  "need",
  "rfi_eoi",
  "tender_open",
  "evaluation",
  "award",
  "contract_development",
  "trial_acceptance",
  "deployment",
  "complete",
  "cancelled",
] as const;
type ProcurementStage = (typeof PROCUREMENT_STAGE_ORDER)[number];
const RELATIONSHIP_QUERY_CHUNK_SIZE = 250;

function chunks<T>(values: T[], size = RELATIONSHIP_QUERY_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let from = 0; from < values.length; from += size) {
    result.push(values.slice(from, from + size));
  }
  return result;
}

function stageForEvent(eventType: string, lifecycle: string): ProcurementStage | null {
  if (eventType === "rfi_rfp_challenge") return lifecycle === "open" ? "rfi_eoi" : "tender_open";
  if (eventType === "procurement_notice") return "tender_open";
  if (eventType === "award") return "award";
  if (eventType === "development") return "contract_development";
  if (eventType === "trial_pilot") return "trial_acceptance";
  if (eventType === "deployment") return "deployment";
  if (eventType === "cancellation") return "cancelled";
  return null;
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function procurementSubject(title: string) {
  const ignored = new Set([
    "and", "for", "from", "into", "new", "the", "with", "contract", "procurement",
    "program", "programme", "project", "system", "systems", "award", "awarded", "rfi", "rfp",
  ]);
  return normalizeConceptKey(title)
    .split(" ")
    .filter((word) => word.length > 2 && !ignored.has(word))
    .slice(0, 8)
    .join(" ");
}

export async function rebuildProcurementCases(admin: SupabaseClient, ownerId: string) {
  const events = await admin
    .from("intelligence_events")
    .select("id,event_type,lifecycle_status,title,announced_at,occurred_at,geography,country_code,amount,currency,confidence")
    .eq("owner_id", ownerId)
    .in("event_type", [
      "rfi_rfp_challenge", "procurement_notice", "award", "development",
      "trial_pilot", "deployment", "cancellation",
    ])
    .order("announced_at", { ascending: true });
  if (events.error) throw new Error(events.error.message);
  const eventIds = (events.data ?? []).map((event) => String(event.id));
  const entityLinkRows: Array<{ event_id: string; entity_id: string; role: string }> = [];
  const evidenceRows: Array<{ event_id: string; document_id: string }> = [];
  for (const eventIdChunk of chunks(eventIds)) {
    const [entityLinks, evidence] = await Promise.all([
      admin
        .from("intelligence_event_entities")
        .select("event_id,entity_id,role")
        .eq("owner_id", ownerId)
        .in("event_id", eventIdChunk),
      admin
        .from("intelligence_event_evidence")
        .select("event_id,document_id")
        .eq("owner_id", ownerId)
        .in("event_id", eventIdChunk),
    ]);
    if (entityLinks.error) throw new Error(entityLinks.error.message);
    if (evidence.error) throw new Error(evidence.error.message);
    entityLinkRows.push(...(entityLinks.data ?? []));
    evidenceRows.push(...(evidence.data ?? []));
  }
  const evidenceDocumentIds = [...new Set(evidenceRows.map((row) => String(row.document_id)))];
  const evidenceDocumentRows: Array<{ id: string; source_identity_id: string | null }> = [];
  for (const documentIdChunk of chunks(evidenceDocumentIds)) {
    const evidenceDocuments = await admin
      .from("documents")
      .select("id,source_identity_id")
      .eq("owner_id", ownerId)
      .in("id", documentIdChunk);
    if (evidenceDocuments.error) throw new Error(evidenceDocuments.error.message);
    evidenceDocumentRows.push(...(evidenceDocuments.data ?? []));
  }
  const sourceByDocument = new Map(
    evidenceDocumentRows.map((row) => [String(row.id), String(row.source_identity_id ?? row.id)]),
  );
  const sourcesByEvent = new Map<string, Set<string>>();
  for (const row of evidenceRows) {
    const eventId = String(row.event_id);
    const sources = sourcesByEvent.get(eventId) ?? new Set<string>();
    sources.add(sourceByDocument.get(String(row.document_id)) ?? String(row.document_id));
    sourcesByEvent.set(eventId, sources);
  }
  const linksByEvent = new Map<string, Array<{ entity_id: string; role: string }>>();
  for (const link of entityLinkRows) {
    const eventId = String(link.event_id);
    const list = linksByEvent.get(eventId) ?? [];
    list.push({ entity_id: String(link.entity_id), role: String(link.role) });
    linksByEvent.set(eventId, list);
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const event of events.data ?? []) {
    const stage = stageForEvent(String(event.event_type), String(event.lifecycle_status));
    if (!stage) continue;
    const links = linksByEvent.get(String(event.id)) ?? [];
    const buyer = links.find((link) => link.role === "buyer" || link.role === "customer")?.entity_id;
    const program = links.find((link) => link.role === "program")?.entity_id;
    const system = links.find((link) => link.role === "system" || link.role === "subject")?.entity_id;
    const subject = procurementSubject(String(event.title));
    const groupingBasis = `${buyer ?? event.country_code ?? event.geography ?? "unknown"}:${program ?? system ?? subject}`;
    const caseKey = stableHash(groupingBasis);
    const list = groups.get(caseKey) ?? [];
    list.push({ ...event, stage, buyer, program, system });
    groups.set(caseKey, list);
  }

  let linkCount = 0;
  for (const [caseKey, rows] of groups) {
    const ordered = [...rows].sort((a, b) =>
      String(a.announced_at ?? a.occurred_at ?? "").localeCompare(
        String(b.announced_at ?? b.occurred_at ?? ""),
      ),
    );
    const latest = ordered.at(-1)!;
    const latestStage = ordered
      .map((row) => row.stage as ProcurementStage)
      .sort((a, b) => PROCUREMENT_STAGE_ORDER.indexOf(a) - PROCUREMENT_STAGE_ORDER.indexOf(b))
      .at(-1)!;
    const caseSources = new Set(
      ordered.flatMap((row) => [...(sourcesByEvent.get(String(row.id)) ?? [])]),
    );
    const caseWrite = await admin
      .from("intelligence_procurement_cases")
      .upsert(
        {
          owner_id: ownerId,
          case_key: caseKey,
          title: String(latest.title),
          buyer_entity_id: latest.buyer ?? null,
          program_entity_id: latest.program ?? null,
          system_entity_id: latest.system ?? null,
          geography: latest.geography ?? null,
          country_code: latest.country_code ?? null,
          current_stage: latestStage,
          status: latestStage === "cancelled" ? "cancelled" : latestStage === "complete" ? "complete" : "active",
          opened_at: ordered[0]?.announced_at ?? ordered[0]?.occurred_at ?? null,
          last_transition_at: latest.announced_at ?? latest.occurred_at ?? null,
          amount: latest.amount ?? null,
          currency: latest.currency ?? null,
          source_count: caseSources.size,
          confidence: Math.max(...ordered.map((row) => Number(row.confidence ?? 0.5))),
          metadata: { grouping_version: "procurement-cases-v1", event_count: ordered.length },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,case_key" },
      )
      .select("id")
      .single();
    if (caseWrite.error) throw new Error(caseWrite.error.message);
    const links = ordered.map((row) => ({
      owner_id: ownerId,
      case_id: caseWrite.data.id,
      event_id: row.id,
      stage: row.stage,
      transition_at: row.announced_at ?? row.occurred_at ?? null,
      confidence: Number(row.confidence ?? 0.5),
      source: "rule",
      metadata: { grouping_version: "procurement-cases-v1" },
    }));
    const linkWrite = await admin
      .from("intelligence_procurement_case_events")
      .upsert(links, { onConflict: "case_id,event_id" });
    if (linkWrite.error) throw new Error(linkWrite.error.message);
    linkCount += links.length;
  }
  return { caseCount: groups.size, linkCount };
}

function normalCdf(value: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(value));
  const density = 0.3989423 * Math.exp((-value * value) / 2);
  const probability = 1 - density * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return value >= 0 ? probability : 1 - probability;
}

function associationPValue(a: number, b: number, both: number, total: number) {
  if (!total || !a || !b) return 1;
  const expected = (a * b) / total;
  const variance = Math.max(1e-9, expected * (1 - a / total) * (1 - b / total));
  return Math.min(1, 2 * (1 - normalCdf(Math.abs((both - expected) / Math.sqrt(variance)))));
}

export async function rebuildConceptCooccurrence(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
) {
  const periodEnd = latestCompleteDateKey(anchor);
  const periodStart = shiftDateKey(periodEnd, -27);
  const documents = await admin
    .from("documents")
    .select("id,source_identity_id")
    .eq("owner_id", ownerId)
    .gte("published_at", `${periodStart}T00:00:00.000Z`)
    .lt("published_at", `${shiftDateKey(periodEnd, 1)}T00:00:00.000Z`);
  if (documents.error) throw new Error(documents.error.message);
  const documentIds = (documents.data ?? []).map((row) => String(row.id));
  if (!documentIds.length) return { pairCount: 0, qualifiedCount: 0, periodStart, periodEnd };
  const factRows: Array<{ document_id: string; concept_id: string }> = [];
  for (const documentIdChunk of chunks(documentIds)) {
    const facts = await admin
      .from("intelligence_document_concepts")
      .select("document_id,concept_id")
      .eq("owner_id", ownerId)
      .in("document_id", documentIdChunk);
    if (facts.error) throw new Error(facts.error.message);
    factRows.push(...(facts.data ?? []));
  }
  const conceptsByDocument = new Map<string, Set<string>>();
  for (const fact of factRows) {
    const id = String(fact.document_id);
    const concepts = conceptsByDocument.get(id) ?? new Set<string>();
    concepts.add(String(fact.concept_id));
    conceptsByDocument.set(id, concepts);
  }
  const counts = new Map<string, number>();
  const sourcesByPair = new Map<string, Set<string>>();
  const individual = new Map<string, number>();
  const sourceByDocument = new Map(
    (documents.data ?? []).map((row) => [String(row.id), String(row.source_identity_id ?? row.id)]),
  );
  for (const [documentId, conceptSet] of conceptsByDocument) {
    const concepts = [...conceptSet].sort();
    for (const concept of concepts) individual.set(concept, (individual.get(concept) ?? 0) + 1);
    for (let left = 0; left < concepts.length; left += 1) {
      for (let right = left + 1; right < concepts.length; right += 1) {
        const key = `${concepts[left]}:${concepts[right]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const sources = sourcesByPair.get(key) ?? new Set<string>();
        sources.add(sourceByDocument.get(documentId)!);
        sourcesByPair.set(key, sources);
      }
    }
  }
  const total = documentIds.length;
  const scored = [...counts.entries()].map(([key, both]) => {
    const [aId, bId] = key.split(":");
    const a = individual.get(aId!) ?? 0;
    const b = individual.get(bId!) ?? 0;
    const pA = a / total;
    const pB = b / total;
    const pBoth = both / total;
    const lift = pA && pB ? pBoth / (pA * pB) : 0;
    const jaccard = both / Math.max(1, a + b - both);
    const npmi = pBoth > 0 && pA > 0 && pB > 0
      ? Math.log(pBoth / (pA * pB)) / -Math.log(pBoth)
      : 0;
    return { key, aId: aId!, bId: bId!, a, b, both, lift, jaccard, npmi, p: associationPValue(a, b, both, total) };
  }).sort((a, b) => a.p - b.p);
  const rows = scored.map((row, index) => {
    const fdr = Math.min(1, (row.p * scored.length) / (index + 1));
    const sourceCount = sourcesByPair.get(row.key)?.size ?? 0;
    return {
      owner_id: ownerId,
      pair_key: `concept:${row.key}`,
      subject_a_type: "concept",
      subject_a_id: row.aId,
      subject_b_type: "concept",
      subject_b_id: row.bId,
      grain: "document",
      channel: "all",
      period_start: periodStart,
      period_end: periodEnd,
      support_count: row.both,
      subject_a_count: row.a,
      subject_b_count: row.b,
      eligible_count: total,
      source_count: sourceCount,
      confidence: 1 - fdr,
      lift: row.lift,
      jaccard: row.jaccard,
      npmi: row.npmi,
      momentum: 0,
      qualified: row.both >= 5 && sourceCount >= 3 && row.lift >= 1.25 && fdr <= 0.05,
      metadata: { p_value: row.p, fdr, method: "normal-approximation-bh-v1" },
      computed_at: new Date().toISOString(),
    };
  });
  for (let from = 0; from < rows.length; from += 500) {
    const write = await admin
      .from("intelligence_cooccurrence_snapshots")
      .upsert(rows.slice(from, from + 500), {
        onConflict: "owner_id,pair_key,grain,channel,period_start,period_end",
      });
    if (write.error) throw new Error(write.error.message);
  }
  return {
    pairCount: rows.length,
    qualifiedCount: rows.filter((row) => row.qualified).length,
    periodStart,
    periodEnd,
  };
}

export const __testables = {
  associationPValue,
  chunks,
  procurementSubject,
  stageForEvent,
};
