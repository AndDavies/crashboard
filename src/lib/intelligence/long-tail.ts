import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeConceptKey } from "@/lib/intelligence/concepts";

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function eligibleLongTail(value: string) {
  const normalized = normalizeConceptKey(value);
  return normalized.length >= 4 && normalized.length <= 100 && normalized.split(" ").length <= 10 &&
    !/^(?:news|newsletter|daily|weekly|update|brief|other|general|technology)$/u.test(normalized);
}

export async function bootstrapLongTailConcepts(admin: SupabaseClient, ownerId: string) {
  const documents: Array<{ id: string; source_identity_id: string | null; metadata: Record<string, unknown> | null; keywords: string[] | null }> = [];
  for (let from = 0; ; from += 500) {
    const result = await admin.from("documents").select("id,source_identity_id,metadata,keywords").eq("owner_id", ownerId).range(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    documents.push(...(result.data ?? []));
    if ((result.data ?? []).length < 500) break;
  }
  const candidates = new Map<string, { label: string; documentIds: Set<string>; sourceIds: Set<string>; keyword: boolean }>();
  for (const document of documents) {
    const metadata = document.metadata ?? {};
    const values = [...stringArray(metadata.themes).map((label) => ({ label, keyword: false })), ...stringArray(document.keywords).map((label) => ({ label, keyword: true }))];
    for (const value of values) {
      if (!eligibleLongTail(value.label)) continue;
      const key = normalizeConceptKey(value.label);
      const current = candidates.get(key) ?? { label: value.label.trim(), documentIds: new Set<string>(), sourceIds: new Set<string>(), keyword: value.keyword };
      current.documentIds.add(document.id);
      current.sourceIds.add(document.source_identity_id ?? `document:${document.id}`);
      current.keyword = current.keyword && value.keyword;
      candidates.set(key, current);
    }
  }
  const qualified = [...candidates.entries()].filter(([, value]) => value.documentIds.size >= 3 && value.sourceIds.size >= 2);
  if (!qualified.length) return { conceptCount: 0, factCount: 0 };
  const concepts = await admin.from("intelligence_concepts").upsert(qualified.map(([normalizedKey, value]) => ({ owner_id: ownerId, concept_type: value.keyword ? "keyword" : "theme", canonical_label: value.label, normalized_key: normalizedKey, domain: "Emergent", subdomain: value.keyword ? "legacy keyword" : "long-tail theme", taxonomy_version: "signal-taxonomy-v1", metadata: { provenance: "legacy_support_bootstrap", supporting_documents: value.documentIds.size, supporting_sources: value.sourceIds.size }, updated_at: new Date().toISOString() })), { onConflict: "owner_id,concept_type,normalized_key" }).select("id,concept_type,normalized_key");
  if (concepts.error) throw new Error(concepts.error.message);
  const ids = new Map((concepts.data ?? []).map((row) => [`${row.concept_type}:${row.normalized_key}`, String(row.id)]));
  const aliases = qualified.flatMap(([normalizedKey, value]) => { const conceptId = ids.get(`${value.keyword ? "keyword" : "theme"}:${normalizedKey}`); return conceptId ? [{ owner_id: ownerId, concept_id: conceptId, alias: value.label, normalized_alias: normalizedKey, source: "legacy", confidence: 0.7 }] : []; });
  const aliasWrite = await admin.from("intelligence_concept_aliases").upsert(aliases, { onConflict: "concept_id,normalized_alias" });
  if (aliasWrite.error) throw new Error(aliasWrite.error.message);
  const facts = qualified.flatMap(([normalizedKey, value]) => { const conceptId = ids.get(`${value.keyword ? "keyword" : "theme"}:${normalizedKey}`); return conceptId ? [...value.documentIds].map((documentId) => ({ owner_id: ownerId, association_key: `${documentId}:document:${conceptId}:document_theme:legacy`, document_id: documentId, segment_id: null, concept_id: conceptId, scope: value.keyword ? "legacy_keyword" : "document_theme", source: "legacy", mention_count: 1, confidence: 0.7, surface_forms: [value.label], extraction_version: "legacy-support-v1", metadata: {}, updated_at: new Date().toISOString() })) : []; });
  for (let from = 0; from < facts.length; from += 500) { const write = await admin.from("intelligence_document_concepts").upsert(facts.slice(from, from + 500), { onConflict: "owner_id,association_key" }); if (write.error) throw new Error(write.error.message); }
  return { conceptCount: qualified.length, factCount: facts.length };
}

export const __testables = { eligibleLongTail, stringArray };
