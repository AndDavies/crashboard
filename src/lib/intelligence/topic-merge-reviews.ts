import type { SupabaseClient } from "@supabase/supabase-js";

type DbRow = Record<string, unknown>;

export type TopicMergeSuggestion = {
  id: string;
  label: string;
  domain: string | null;
  description: string | null;
  targetId: string;
  targetLabel: string;
  targetStatus: string;
  similarity: number;
  supportItems: number;
  sourceFamilies: number;
  updatedAt: string;
};

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DbRow
    : {};
}

export function pendingTopicMergeSuggestion(
  candidate: DbRow,
  target: DbRow | undefined,
): TopicMergeSuggestion | null {
  const metadata = object(candidate.metadata);
  const similarity = Number(metadata.suggested_similarity ?? 0);
  const targetId = String(metadata.suggested_concept_id ?? "").trim();
  if (
    candidate.status !== "candidate" ||
    metadata.approval_required !== true ||
    (metadata.merge_review_status && metadata.merge_review_status !== "pending") ||
    similarity < 0.8 || similarity >= 0.92 ||
    !targetId || !target ||
    String(target.id ?? "") !== targetId ||
    !["active", "candidate"].includes(String(target.status))
  ) return null;
  return {
    id: String(candidate.id),
    label: String(candidate.canonical_label ?? "Candidate topic"),
    domain: typeof candidate.domain === "string" ? candidate.domain : null,
    description: typeof candidate.description === "string" ? candidate.description : null,
    targetId,
    targetLabel: String(target.canonical_label ?? "Existing topic"),
    targetStatus: String(target.status),
    similarity,
    supportItems: Math.max(0, Number(metadata.support_items ?? 0)),
    sourceFamilies: Math.max(0, Number(metadata.source_families ?? 0)),
    updatedAt: String(candidate.updated_at ?? ""),
  };
}

export async function listTopicMergeSuggestions(
  admin: SupabaseClient,
  ownerId: string,
) {
  const candidates = await admin.from("intelligence_concepts")
    .select("id,canonical_label,domain,description,status,metadata,updated_at")
    .eq("owner_id", ownerId)
    .eq("status", "candidate")
    .contains("metadata", { approval_required: true })
    .order("updated_at", { ascending: false })
    .limit(50);
  if (candidates.error) throw new Error(candidates.error.message);
  const targetIds = [...new Set((candidates.data ?? []).map((row) =>
    String(object(row.metadata).suggested_concept_id ?? "").trim()
  ).filter(Boolean))];
  const targets = targetIds.length
    ? await admin.from("intelligence_concepts")
      .select("id,canonical_label,status")
      .eq("owner_id", ownerId)
      .in("id", targetIds)
    : { data: [], error: null };
  if (targets.error) throw new Error(targets.error.message);
  const targetById = new Map((targets.data ?? []).map((row) => [String(row.id), row as DbRow]));
  return (candidates.data ?? []).flatMap((row) => {
    const targetId = String(object(row.metadata).suggested_concept_id ?? "").trim();
    const suggestion = pendingTopicMergeSuggestion(row as DbRow, targetById.get(targetId));
    return suggestion ? [suggestion] : [];
  });
}

export async function reviewTopicMergeSuggestion(
  admin: SupabaseClient,
  ownerId: string,
  input: {
    candidateId: string;
    targetId: string;
    decision: "approve" | "reject";
  },
) {
  const result = await admin.rpc("review_intelligence_topic_merge_suggestion", {
    query_owner: ownerId,
    query_candidate: input.candidateId,
    query_target: input.targetId,
    query_decision: input.decision,
  });
  if (result.error) throw new Error(result.error.message);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error("Topic review did not return a result.");
  return row;
}
