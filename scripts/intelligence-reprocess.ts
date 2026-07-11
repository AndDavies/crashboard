import { config } from "dotenv";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { getGmailMessage, gmailMessageToEnvelope } from "../src/lib/intelligence/gmail";
import {
  getGmailSource,
  gmailAccessTokenForSource,
} from "../src/lib/intelligence/jobs";
import { normalizeConceptKey } from "../src/lib/intelligence/concepts";
import { persistIntelligenceDocument } from "../src/lib/intelligence/persistence";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function eligibleLongTail(value: string) {
  const normalized = normalizeConceptKey(value);
  return (
    normalized.length >= 4 &&
    normalized.length <= 100 &&
    normalized.split(" ").length <= 10 &&
    !/^(?:news|newsletter|daily|weekly|update|brief|other|general|technology)$/u.test(normalized)
  );
}

async function bootstrapLongTailConcepts(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
) {
  const documents: Array<{
    id: string;
    source_identity_id: string | null;
    metadata: Record<string, unknown> | null;
    keywords: string[] | null;
  }> = [];
  for (let from = 0; ; from += 500) {
    const result = await admin
      .from("documents")
      .select("id,source_identity_id,metadata,keywords")
      .eq("owner_id", ownerId)
      .range(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    documents.push(...(result.data ?? []));
    if ((result.data ?? []).length < 500) break;
  }

  const candidates = new Map<
    string,
    { label: string; documentIds: Set<string>; sourceIds: Set<string>; keyword: boolean }
  >();
  for (const document of documents) {
    const metadata = document.metadata ?? {};
    const values = [
      ...stringArray(metadata.themes).map((label) => ({ label, keyword: false })),
      ...stringArray(document.keywords).map((label) => ({ label, keyword: true })),
    ];
    for (const value of values) {
      if (!eligibleLongTail(value.label)) continue;
      const key = normalizeConceptKey(value.label);
      const current = candidates.get(key) ?? {
        label: value.label.trim(),
        documentIds: new Set<string>(),
        sourceIds: new Set<string>(),
        keyword: value.keyword,
      };
      current.documentIds.add(document.id);
      current.sourceIds.add(document.source_identity_id ?? `document:${document.id}`);
      current.keyword = current.keyword && value.keyword;
      candidates.set(key, current);
    }
  }

  const qualified = [...candidates.entries()].filter(
    ([, value]) => value.documentIds.size >= 3 && value.sourceIds.size >= 2,
  );
  if (!qualified.length) return { conceptCount: 0, factCount: 0 };

  const concepts = await admin
    .from("intelligence_concepts")
    .upsert(
      qualified.map(([normalizedKey, value]) => ({
        owner_id: ownerId,
        concept_type: value.keyword ? "keyword" : "theme",
        canonical_label: value.label,
        normalized_key: normalizedKey,
        domain: "Emergent",
        subdomain: value.keyword ? "legacy keyword" : "long-tail theme",
        taxonomy_version: "signal-taxonomy-v1",
        metadata: {
          provenance: "legacy_support_bootstrap",
          supporting_documents: value.documentIds.size,
          supporting_sources: value.sourceIds.size,
        },
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "owner_id,concept_type,normalized_key" },
    )
    .select("id,concept_type,normalized_key");
  if (concepts.error) throw new Error(concepts.error.message);

  const ids = new Map(
    (concepts.data ?? []).map((row) => [
      `${row.concept_type}:${row.normalized_key}`,
      String(row.id),
    ]),
  );
  const aliases = qualified.flatMap(([normalizedKey, value]) => {
    const conceptType = value.keyword ? "keyword" : "theme";
    const conceptId = ids.get(`${conceptType}:${normalizedKey}`);
    return conceptId
      ? [{
          owner_id: ownerId,
          concept_id: conceptId,
          alias: value.label,
          normalized_alias: normalizedKey,
          source: "legacy",
          confidence: 0.7,
        }]
      : [];
  });
  const aliasWrite = await admin.from("intelligence_concept_aliases").upsert(aliases, {
    onConflict: "concept_id,normalized_alias",
  });
  if (aliasWrite.error) throw new Error(aliasWrite.error.message);

  const facts = qualified.flatMap(([normalizedKey, value]) => {
    const conceptType = value.keyword ? "keyword" : "theme";
    const conceptId = ids.get(`${conceptType}:${normalizedKey}`);
    if (!conceptId) return [];
    return [...value.documentIds].map((documentId) => ({
      owner_id: ownerId,
      association_key: `${documentId}:document:${conceptId}:document_theme:legacy`,
      document_id: documentId,
      segment_id: null,
      concept_id: conceptId,
      scope: value.keyword ? "legacy_keyword" : "document_theme",
      source: "legacy",
      mention_count: 1,
      confidence: 0.7,
      surface_forms: [value.label],
      extraction_version: "legacy-support-v1",
      metadata: {},
      updated_at: new Date().toISOString(),
    }));
  });
  for (let from = 0; from < facts.length; from += 500) {
    const write = await admin
      .from("intelligence_document_concepts")
      .upsert(facts.slice(from, from + 500), { onConflict: "owner_id,association_key" });
    if (write.error) throw new Error(write.error.message);
  }
  return { conceptCount: qualified.length, factCount: facts.length };
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const limit = Math.max(1, Number(argument("--limit") ?? 10_000));
  const offset = Math.max(0, Number(argument("--offset") ?? 0));
  const admin = createAdminClient();
  const source = await getGmailSource(admin, ownerId);
  if (!source) throw new Error("Connect Gmail before reprocessing the archive.");
  const { accessToken } = await gmailAccessTokenForSource(source);
  const startedAt = new Date().toISOString();
  const run = await admin
    .from("intelligence_runs")
    .insert({
      owner_id: ownerId,
      source_id: source.id,
      run_type: "reprocess",
      status: "running",
      started_at: startedAt,
      heartbeat_at: startedAt,
      checkpoint_before: { offset, limit },
    })
    .select("id")
    .single();
  if (run.error) throw new Error(run.error.message);

  let processed = 0;
  let failed = 0;
  let segmentCount = 0;
  let conceptCount = 0;
  const errors: string[] = [];
  const documents = await admin
    .from("documents")
    .select("id,external_id")
    .eq("owner_id", ownerId)
    .eq("source_type", "email_newsletter")
    .order("published_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (documents.error) throw new Error(documents.error.message);

  for (const document of documents.data ?? []) {
    try {
      const message = await getGmailMessage(accessToken, String(document.external_id), "full");
      const envelope = gmailMessageToEnvelope(message, ownerId);
      const result = await persistIntelligenceDocument(admin, envelope, {
        extraction: null,
        embedding: null,
        preserveExistingEnrichment: true,
      });
      processed += 1;
      segmentCount += result.segmentIds.length;
      conceptCount += result.conceptIds.length;
    } catch (error) {
      failed += 1;
      const message = `${String(document.external_id)}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error(`[intelligence-reprocess] ${message}`);
    }
    if ((processed + failed) % 25 === 0) {
      const heartbeat = await admin
        .from("intelligence_runs")
        .update({ processed_count: processed, failed_count: failed, heartbeat_at: new Date().toISOString() })
        .eq("id", run.data.id);
      if (heartbeat.error) throw new Error(heartbeat.error.message);
      process.stdout.write(`${JSON.stringify({ processed, failed, segmentCount, conceptCount })}\n`);
    }
  }

  const longTail = await bootstrapLongTailConcepts(admin, ownerId);
  const completedAt = new Date().toISOString();
  const finish = await admin
    .from("intelligence_runs")
    .update({
      status: failed ? "partial" : "completed",
      discovered_count: (documents.data ?? []).length,
      processed_count: processed,
      failed_count: failed,
      error_summary: errors.slice(0, 10).join("\n") || null,
      checkpoint_after: { offset: offset + (documents.data ?? []).length, long_tail: longTail },
      heartbeat_at: completedAt,
      completed_at: completedAt,
    })
    .eq("id", run.data.id);
  if (finish.error) throw new Error(finish.error.message);
  process.stdout.write(
    `${JSON.stringify({ processed, failed, segmentCount, conceptCount, longTail })}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
