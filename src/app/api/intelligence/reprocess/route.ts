import { NextResponse } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailMessage, gmailMessageToEnvelope } from "@/lib/intelligence/gmail";
import { getGmailSource, gmailAccessTokenForSource } from "@/lib/intelligence/jobs";
import { persistIntelligenceDocument } from "@/lib/intelligence/persistence";
import { bootstrapLongTailConcepts } from "@/lib/intelligence/long-tail";
import { getTursoIntelligenceStore, intelligenceUsesTurso } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const ownerId = (await requireDashboardUser()).id;
    const body = (await request.json().catch(() => ({}))) as { offset?: number; limit?: number };
    if (intelligenceUsesTurso()) {
      const jobId = await getTursoIntelligenceStore().enqueueJob({
        ownerId,
        jobType: "backfill",
        priority: 80,
        payload: { requestedOffset: body.offset ?? 0, batchSize: body.limit ?? 25 },
      });
      return NextResponse.json({ result: { queued: true, jobId, hasMore: true, processed: 0 } }, { status: 202 });
    }
    const requestedOffset = Math.max(0, Math.floor(Number(body.offset ?? 0)));
    let offset = requestedOffset;
    const limit = Math.max(1, Math.min(50, Math.floor(Number(body.limit ?? 25))));
    const admin = createAdminClient();
    if (requestedOffset === 0) {
      const previous = await admin
        .from("intelligence_runs")
        .select("checkpoint_after")
        .eq("owner_id", ownerId)
        .eq("run_type", "reprocess")
        .in("status", ["completed", "partial"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previous.error) throw new Error(previous.error.message);
      const checkpoint = (previous.data?.checkpoint_after ?? {}) as {
        has_more?: boolean;
        next_offset?: number;
      };
      if (checkpoint.has_more && Number(checkpoint.next_offset) > 0) {
        offset = Number(checkpoint.next_offset);
      } else if (Number(checkpoint.next_offset) > 0) {
        const missing = await admin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", ownerId)
          .eq("source_type", "email_newsletter")
          .is("analytics_ready_at", null);
        if (missing.error) throw new Error(missing.error.message);
        if (Number(missing.count ?? 0) > 0) offset = Number(checkpoint.next_offset);
      }
    }
    const source = await getGmailSource(admin, ownerId);
    if (!source) return NextResponse.json({ error: "Connect Gmail before reprocessing." }, { status: 409 });
    const { accessToken } = await gmailAccessTokenForSource(source);
    const documents = await admin.from("documents").select("id,external_id", { count: "exact" }).eq("owner_id", ownerId).eq("source_type", "email_newsletter").order("published_at", { ascending: true }).range(offset, offset + limit - 1);
    if (documents.error) throw new Error(documents.error.message);
    const startedAt = new Date().toISOString();
    const run = await admin.from("intelligence_runs").insert({ owner_id: ownerId, source_id: source.id, run_type: "reprocess", status: "running", started_at: startedAt, heartbeat_at: startedAt, checkpoint_before: { offset, limit }, discovered_count: (documents.data ?? []).length }).select("id").single();
    if (run.error) throw new Error(run.error.message);
    let processed = 0; let failed = 0; let segments = 0; let concepts = 0;
    const errors: string[] = [];
    const processDocuments = async (
      batch: Array<{ id: string; external_id: string | null }>,
    ) => {
    for (let from = 0; from < batch.length; from += 5) {
      await Promise.all(
        batch.slice(from, from + 5).map(async (document) => {
          try {
            const message = await getGmailMessage(
              accessToken,
              String(document.external_id),
              "full",
            );
            const result = await persistIntelligenceDocument(
              admin,
              gmailMessageToEnvelope(message, ownerId),
              {
                extraction: null,
                embedding: null,
                preserveExistingEnrichment: true,
              },
            );
            processed += 1;
            segments += result.segmentIds.length;
            concepts += result.conceptIds.length;
          } catch (error) {
            failed += 1;
            errors.push(
              `${String(document.external_id)}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );
    }
    };
    await processDocuments(documents.data ?? []);
    const nextOffset = offset + (documents.data ?? []).length;
    const hasMore = nextOffset < Number(documents.count ?? nextOffset);
    let retryCount = 0;
    let remainingMissing = 0;
    if (!hasMore) {
      const missing = await admin
        .from("documents")
        .select("id,external_id")
        .eq("owner_id", ownerId)
        .eq("source_type", "email_newsletter")
        .is("analytics_ready_at", null)
        .limit(100);
      if (missing.error) throw new Error(missing.error.message);
      retryCount = (missing.data ?? []).length;
      await processDocuments(missing.data ?? []);
      const remaining = await admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("source_type", "email_newsletter")
        .is("analytics_ready_at", null);
      if (remaining.error) throw new Error(remaining.error.message);
      remainingMissing = Number(remaining.count ?? 0);
    }
    const retryMadeProgress = retryCount > 0 && processed > 0;
    const finalHasMore = hasMore || (remainingMissing > 0 && retryMadeProgress);
    const longTail = finalHasMore ? null : await bootstrapLongTailConcepts(admin, ownerId);
    const completedAt = new Date().toISOString();
    const finish = await admin.from("intelligence_runs").update({ status: failed ? "partial" : "completed", processed_count: processed, failed_count: failed, error_summary: errors.slice(0, 5).join("\n") || null, checkpoint_after: { next_offset: nextOffset, has_more: finalHasMore, remaining_missing: remainingMissing, long_tail: longTail }, heartbeat_at: completedAt, completed_at: completedAt }).eq("id", run.data.id);
    if (finish.error) throw new Error(finish.error.message);
    return NextResponse.json({ result: { offset, nextOffset, total: documents.count ?? nextOffset, hasMore: finalHasMore, processed, failed, segments, concepts, retryCount, remainingMissing, errors: errors.slice(0, 5), longTail } });
  } catch (error) {
    console.error("[intelligence] Archive reprocessing failed.", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Archive reprocessing failed." }, { status: 500 });
  }
}
