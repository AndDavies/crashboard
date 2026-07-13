import { config } from "dotenv";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { rebuildStoryAndEventClustersV2 } from "../src/lib/intelligence/dedup-v2";
import { refreshSegmentEmbeddingsBatch } from "../src/lib/intelligence/hybrid-search-v2";
import {
  prepareNewsletterResegmentation,
  resegmentNewsletterBatch,
} from "../src/lib/intelligence/resegmentation-v2";
import { refreshSignalsV2 } from "../src/lib/intelligence/signal-refresh-v2";
import { refreshTermObservationsBatch } from "../src/lib/intelligence/term-observations";
import {
  refreshConceptEmbeddingsBatch,
  runTopicMaintenance,
} from "../src/lib/intelligence/topic-maintenance-v2";

type Phase = "segmentation" | "terms" | "embeddings" | "concept_embeddings" | "topic_maintenance" | "dedupe" | "signals" | "complete";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string) {
  return process.argv.includes(name);
}

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1_000) {
    const result = await query(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1_000) return rows;
  }
}

async function coverage(admin: ReturnType<typeof createAdminClient>, ownerId: string) {
  const [documents, v2Segments, eligibleSegments, observedSegments, embeddedSegments,
    concepts, embeddedConcepts] = await Promise.all([
    admin.from("documents").select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId).eq("source_type", "email_newsletter"),
    fetchPages((from, to) => admin.from("intelligence_document_segments").select("document_id")
      .eq("owner_id", ownerId).eq("parser_version", "newsletter-segments-v2").range(from, to)),
    fetchPages((from, to) => admin.from("intelligence_document_segments").select("id")
      .eq("owner_id", ownerId).in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null).range(from, to)),
    fetchPages((from, to) => admin.from("intelligence_term_observations").select("segment_id")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages((from, to) => admin.from("intelligence_segment_embeddings").select("segment_id")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages((from, to) => admin.from("intelligence_concepts").select("id")
      .eq("owner_id", ownerId).in("status", ["active", "candidate"]).range(from, to)),
    fetchPages((from, to) => admin.from("intelligence_concept_embeddings").select("concept_id")
      .eq("owner_id", ownerId).range(from, to)),
  ]);
  if (documents.error) throw new Error(documents.error.message);
  const eligible = new Set(eligibleSegments.map((row) => String(row.id)));
  const v2DocumentIds = new Set(v2Segments.map((row) => String(row.document_id)));
  const observed = new Set(observedSegments.map((row) => String(row.segment_id)));
  const embedded = new Set(embeddedSegments.map((row) => String(row.segment_id)));
  const conceptIds = new Set(concepts.map((row) => String(row.id)));
  const embeddedConceptIds = new Set(embeddedConcepts.map((row) => String(row.concept_id)));
  return {
    newsletterDocuments: documents.count ?? 0,
    parserV2Documents: v2DocumentIds.size,
    eligibleSegments: eligible.size,
    termCoverage: eligible.size
      ? [...eligible].filter((id) => observed.has(id)).length / eligible.size
      : 1,
    embeddingCoverage: eligible.size
      ? [...eligible].filter((id) => embedded.has(id)).length / eligible.size
      : 1,
    conceptEmbeddingCoverage: conceptIds.size
      ? [...conceptIds].filter((id) => embeddedConceptIds.has(id)).length / conceptIds.size
      : 1,
  };
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const admin = createAdminClient();
  const previousRuns = await admin.from("intelligence_runs")
    .select("id,status,checkpoint_after,created_at")
    .eq("owner_id", ownerId).eq("run_type", "backfill")
    .order("created_at", { ascending: false }).limit(20);
  if (previousRuns.error) throw new Error(previousRuns.error.message);
  const resumable = (previousRuns.data ?? []).find((run) => {
    const checkpoint = run.checkpoint_after as Record<string, unknown> | null;
    return checkpoint?.job === "intelligence_v2" && run.status !== "completed";
  });
  const checkpoint = resumable?.checkpoint_after as Record<string, unknown> | null;
  let phase = (checkpoint?.phase as Phase | undefined) ?? "segmentation";
  let cursor = Math.max(0, Number(checkpoint?.cursor ?? 0));
  let runId = resumable?.id ? String(resumable.id) : "";
  if (!runId) {
    const run = await admin.from("intelligence_runs").insert({
      owner_id: ownerId,
      run_type: "backfill",
      status: "running",
      started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      checkpoint_after: { job: "intelligence_v2", phase, cursor },
    }).select("id").single();
    if (run.error) throw new Error(run.error.message);
    runId = String(run.data.id);
  } else {
    const resume = await admin.from("intelligence_runs").update({
      status: "running",
      heartbeat_at: new Date().toISOString(),
      error_summary: null,
    }).eq("id", runId);
    if (resume.error) throw new Error(resume.error.message);
  }
  const save = async (nextPhase: Phase, nextCursor: number, progress: Record<string, unknown>) => {
    phase = nextPhase;
    cursor = nextCursor;
    const write = await admin.from("intelligence_runs").update({
      status: nextPhase === "complete" ? "completed" : "running",
      heartbeat_at: new Date().toISOString(),
      completed_at: nextPhase === "complete" ? new Date().toISOString() : null,
      checkpoint_after: { job: "intelligence_v2", phase: nextPhase, cursor: nextCursor, ...progress },
    }).eq("id", runId);
    if (write.error) throw new Error(write.error.message);
  };

  try {
    const initial = await coverage(admin, ownerId);
    console.log("Initial coverage", initial);
    while (phase !== "complete") {
      if (phase === "segmentation") {
        if (flag("--skip-segmentation") || initial.parserV2Documents >= initial.newsletterDocuments) {
          await save("terms", 0, { skipped: "segmentation" });
          continue;
        }
        const segmentationContext = await prepareNewsletterResegmentation(admin, ownerId);
        const result = await resegmentNewsletterBatch(admin, ownerId, segmentationContext, {
          cursor,
          limit: Number(argument("--segment-batch") ?? 25),
        });
        console.log("Segmentation", result);
        await save(result.hasMore ? "segmentation" : "terms", result.nextCursor ?? 0, { segmentation: result });
        continue;
      }
      if (phase === "terms") {
        const current = await coverage(admin, ownerId);
        if (flag("--skip-terms") || (cursor === 0 && current.termCoverage >= 1)) {
          await save("embeddings", 0, { skipped: "terms", termCoverage: current.termCoverage });
          continue;
        }
        const result = await refreshTermObservationsBatch(admin, ownerId, { cursor, limit: 100 });
        console.log("Terms", result);
        await save(result.complete ? "embeddings" : "terms", result.nextCursor ?? 0, { terms: result });
        continue;
      }
      if (phase === "embeddings") {
        const current = await coverage(admin, ownerId);
        if (flag("--skip-embeddings") || (cursor === 0 && current.embeddingCoverage >= 1)) {
          await save("concept_embeddings", 0, { skipped: "embeddings", embeddingCoverage: current.embeddingCoverage });
          continue;
        }
        const result = await refreshSegmentEmbeddingsBatch(admin, ownerId, {
          cursor,
          limit: Number(argument("--embedding-batch") ?? 25),
        });
        console.log("Embeddings", result);
        await save(result.hasMore ? "embeddings" : "concept_embeddings", result.nextCursor ?? 0, { embeddings: result });
        continue;
      }
      if (phase === "concept_embeddings") {
        const current = await coverage(admin, ownerId);
        if (flag("--skip-embeddings") || (cursor === 0 && current.conceptEmbeddingCoverage >= 1)) {
          await save("topic_maintenance", 0, { skipped: "concept_embeddings", conceptEmbeddingCoverage: current.conceptEmbeddingCoverage });
          continue;
        }
        const result = await refreshConceptEmbeddingsBatch(admin, ownerId, {
          cursor,
          limit: Number(argument("--embedding-batch") ?? 25),
        });
        console.log("Concept embeddings", result);
        await save(result.hasMore ? "concept_embeddings" : "topic_maintenance", result.nextCursor ?? 0, { conceptEmbeddings: result });
        continue;
      }
      if (phase === "topic_maintenance") {
        if (flag("--skip-topic-maintenance")) {
          await save("dedupe", 0, { skipped: "topic_maintenance" });
          continue;
        }
        const result = await runTopicMaintenance(admin, ownerId, {
          cursor,
          lookbackDays: 180,
          segmentLimit: Number(argument("--topic-batch") ?? 10_000),
        });
        console.log("Topic maintenance", result);
        await save(result.hasMore ? "topic_maintenance" : "dedupe", result.nextCursor ?? 0, { topicMaintenance: result });
        continue;
      }
      if (phase === "dedupe") {
        if (flag("--skip-dedupe")) {
          await save("signals", 0, { skipped: "dedupe" });
          continue;
        }
        const result = await rebuildStoryAndEventClustersV2(admin, ownerId);
        console.log("Deduplication", result);
        await save("signals", 0, { dedupe: result });
        continue;
      }
      if (phase === "signals") {
        const result = await refreshSignalsV2(admin, ownerId);
        console.log("Signals", result);
        await save("complete", 0, { signals: result });
      }
    }
    console.log(`Intelligence v2 backfill complete. Run ${runId}.`);
  } catch (error) {
    await admin.from("intelligence_runs").update({
      status: "partial",
      heartbeat_at: new Date().toISOString(),
      error_summary: error instanceof Error ? error.message : String(error),
      checkpoint_after: { job: "intelligence_v2", phase, cursor },
    }).eq("id", runId);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
