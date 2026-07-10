import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptCredential,
  type EncryptedCredential,
} from "@/lib/intelligence/oauth-crypto";
import {
  getGmailMessage,
  gmailMessageToEnvelope,
  isNewsletterCandidate,
  listGmailMessageIds,
  newsletterBackfillQuery,
  refreshGmailAccessToken,
  type GmailStoredCredential,
} from "@/lib/intelligence/gmail";
import { processIntelligenceDocument } from "@/lib/intelligence/pipeline";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";

export type GmailSourceRow = {
  id: string;
  owner_id: string;
  name: string;
  config: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  credentials_ciphertext: string;
  credentials_iv: string;
  credentials_tag: string;
  last_synced_at: string | null;
};

export type GmailSyncMode = "backfill" | "incremental" | "discovery";

function credentialFromSource(source: GmailSourceRow) {
  return decryptCredential<GmailStoredCredential>({
    ciphertext: source.credentials_ciphertext,
    iv: source.credentials_iv,
    tag: source.credentials_tag,
  });
}

export async function gmailAccessTokenForSource(source: GmailSourceRow) {
  const credential = credentialFromSource(source);
  return {
    accessToken: await refreshGmailAccessToken(credential.refreshToken),
    email: credential.email ?? null,
  };
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function incrementalQuery(source: GmailSourceRow) {
  const end = new Date();
  const start = source.last_synced_at ? new Date(source.last_synced_at) : new Date();
  if (!source.last_synced_at) start.setUTCDate(start.getUTCDate() - 2);
  else start.setUTCDate(start.getUTCDate() - 1);
  return newsletterBackfillQuery(dateOnly(start), dateOnly(end));
}

function discoveryQuery(windowStart: string, windowEnd: string) {
  const end = new Date(windowEnd);
  end.setUTCDate(end.getUTCDate() + 1);
  return `after:${windowStart.slice(0, 10).replaceAll("-", "/")} before:${dateOnly(end).replaceAll("-", "/")} -in:sent -in:drafts -in:spam -in:trash`;
}

export async function getGmailSource(
  admin: SupabaseClient,
  ownerId: string,
): Promise<GmailSourceRow | null> {
  const result = await admin
    .from("intelligence_sources")
    .select("id,owner_id,name,config,checkpoint,credentials_ciphertext,credentials_iv,credentials_tag,last_synced_at")
    .eq("owner_id", ownerId)
    .eq("source_type", "gmail")
    .eq("status", "active")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as GmailSourceRow | null;
}

export async function syncGmailSource(
  admin: SupabaseClient,
  source: GmailSourceRow,
  input: {
    mode: GmailSyncMode;
    maxMessages?: number;
    windowStart?: string;
    windowEnd?: string;
    resetCheckpoint?: boolean;
  },
) {
  const maxMessages = Math.max(1, Math.min(input.maxMessages ?? 10, 25));
  const windowStart = input.windowStart ?? "2026-01-10";
  const windowEnd = input.windowEnd ?? "2026-07-10";
  const previousCheckpoint = input.resetCheckpoint ? {} : (source.checkpoint ?? {});
  const modeCheckpoint =
    previousCheckpoint.mode === input.mode ? previousCheckpoint : {};
  const query =
    input.mode === "backfill"
      ? newsletterBackfillQuery(windowStart, windowEnd)
      : input.mode === "discovery"
        ? discoveryQuery(windowStart, windowEnd)
        : incrementalQuery(source);
  const pageToken =
    typeof modeCheckpoint.next_page_token === "string"
      ? modeCheckpoint.next_page_token
      : null;

  const runResult = await admin
    .from("intelligence_runs")
    .insert({
      owner_id: source.owner_id,
      source_id: source.id,
      run_type: input.mode,
      status: "running",
      window_start: new Date(windowStart).toISOString(),
      window_end: new Date(windowEnd).toISOString(),
      checkpoint_before: previousCheckpoint,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runResult.error) throw new Error(runResult.error.message);
  const runId = String(runResult.data.id);

  let processed = 0;
  let failed = 0;
  let excluded = 0;
  const candidateSenders = new Map<string, { email: string; name: string; count: number }>();

  try {
    const credential = credentialFromSource(source);
    const accessToken = await refreshGmailAccessToken(credential.refreshToken);
    const page = await listGmailMessageIds(accessToken, {
      query,
      pageToken,
      maxResults: maxMessages,
    });

    for (const messageRef of page.messages ?? []) {
      try {
        if (input.mode === "discovery") {
          const message = await getGmailMessage(accessToken, messageRef.id, "metadata");
          if (!isNewsletterCandidate(message)) {
            excluded += 1;
            continue;
          }
          const envelope = gmailMessageToEnvelope(message, source.owner_id);
          const email = String(envelope.metadata?.sender_email ?? "");
          if (email) {
            const current = candidateSenders.get(email) ?? {
              email,
              name: envelope.publisherName ?? email,
              count: 0,
            };
            current.count += 1;
            candidateSenders.set(email, current);
          }
          processed += 1;
          continue;
        }

        const message = await getGmailMessage(accessToken, messageRef.id, "full");
        const envelope = gmailMessageToEnvelope(message, source.owner_id);
        await processIntelligenceDocument(admin, envelope, {
          openaiApiKey: process.env.OPENAI_API_KEY,
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        console.error(`[intelligence] Failed Gmail message ${messageRef.id}.`, error);
      }
    }

    const nextCheckpoint = page.nextPageToken
      ? {
          mode: input.mode,
          query,
          next_page_token: page.nextPageToken,
          window_start: windowStart,
          window_end: windowEnd,
        }
      : {};
    const existingCandidates = Array.isArray(source.config?.candidate_senders)
      ? (source.config?.candidate_senders as Array<Record<string, unknown>>)
      : [];
    const candidateMap = new Map(
      existingCandidates.map((candidate) => [String(candidate.email), candidate]),
    );
    for (const candidate of candidateSenders.values()) {
      const existing = candidateMap.get(candidate.email);
      candidateMap.set(candidate.email, {
        email: candidate.email,
        name: candidate.name,
        count: Number(existing?.count ?? 0) + candidate.count,
        status: existing?.status ?? "candidate",
      });
    }

    const sourceUpdate = await admin
      .from("intelligence_sources")
      .update({
        checkpoint: nextCheckpoint,
        config: {
          ...(source.config ?? {}),
          candidate_senders: [...candidateMap.values()],
        },
        last_synced_at: input.mode === "incremental" ? new Date().toISOString() : source.last_synced_at,
        last_error: failed ? `${failed} messages failed in the latest batch.` : null,
      })
      .eq("id", source.id);
    if (sourceUpdate.error) throw new Error(sourceUpdate.error.message);

    const trendResult =
      input.mode === "discovery"
        ? { snapshotCount: 0 }
        : await refreshTrendSnapshots(admin, source.owner_id);
    const status = failed > 0 || page.nextPageToken ? "partial" : "completed";
    const completed = await admin
      .from("intelligence_runs")
      .update({
        status,
        discovered_count: page.messages?.length ?? 0,
        processed_count: processed,
        failed_count: failed,
        excluded_count: excluded,
        checkpoint_after: nextCheckpoint,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (completed.error) throw new Error(completed.error.message);

    return {
      runId,
      status,
      discovered: page.messages?.length ?? 0,
      processed,
      failed,
      excluded,
      hasMore: Boolean(page.nextPageToken),
      trendSnapshots: trendResult.snapshotCount,
      candidateSenders: [...candidateSenders.values()],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    await admin
      .from("intelligence_runs")
      .update({
        status: "failed",
        processed_count: processed,
        failed_count: failed,
        excluded_count: excluded,
        error_summary: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await admin
      .from("intelligence_sources")
      .update({ status: "error", last_error: message })
      .eq("id", source.id);
    throw error;
  }
}

export function encryptedCredentialColumns(credential: EncryptedCredential) {
  return {
    credentials_ciphertext: credential.ciphertext,
    credentials_iv: credential.iv,
    credentials_tag: credential.tag,
  };
}
