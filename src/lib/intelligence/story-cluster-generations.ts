import type { SupabaseClient } from "@supabase/supabase-js";

export const INTELLIGENCE_STORY_DEDUP_VERSION = "story-dedup-v2.1.0";
export const INTELLIGENCE_STORY_REVIEW_VERSION = "story-review-v2.1.0";

export type StoryMembershipGeneration = {
  generationId: string;
  dedupeVersion: string;
  status: "staging" | "active" | "retired";
  storyClusterCount: number;
  segmentMembershipCount: number;
  documentMembershipCount: number;
  reviewClusterCount: number;
  reviewMembershipCount: number;
  activatedAt: string | null;
};

export type ActiveStoryMembershipGeneration = StoryMembershipGeneration & {
  status: "active";
};

type DbObject = Record<string, unknown>;

function object(value: unknown): DbObject {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? candidate as DbObject
    : {};
}

function count(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function timestamp(value: unknown) {
  const candidate = String(value ?? "");
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

export function parseStoryMembershipGeneration(
  value: unknown,
): StoryMembershipGeneration | null {
  const row = object(value);
  const generationId = String(row.generation_id ?? "");
  const dedupeVersion = String(row.dedupe_version ?? "");
  const status = String(row.status ?? "");
  if (
    !generationId ||
    !dedupeVersion ||
    !["staging", "active", "retired"].includes(status)
  ) return null;
  return {
    generationId,
    dedupeVersion,
    status: status as StoryMembershipGeneration["status"],
    storyClusterCount: count(row.expected_story_cluster_count),
    segmentMembershipCount: count(row.expected_segment_membership_count),
    documentMembershipCount: count(row.expected_document_membership_count),
    reviewClusterCount: count(row.expected_review_cluster_count),
    reviewMembershipCount: count(row.expected_review_membership_count),
    activatedAt: timestamp(row.activated_at),
  };
}

const STORY_GENERATION_COLUMNS = [
  "generation_id",
  "dedupe_version",
  "status",
  "expected_story_cluster_count",
  "expected_segment_membership_count",
  "expected_document_membership_count",
  "expected_review_cluster_count",
  "expected_review_membership_count",
  "activated_at",
].join(",");

export async function loadStoryMembershipGeneration(
  admin: SupabaseClient,
  ownerId: string,
  generationId: string,
) {
  const result = await admin
    .from("intelligence_story_dedup_generations")
    .select(STORY_GENERATION_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("dedupe_version", INTELLIGENCE_STORY_DEDUP_VERSION)
    .eq("generation_id", generationId)
    .maybeSingle();
  if (result.error) {
    throw new Error(`Story membership generation lookup failed: ${result.error.message}`);
  }
  return parseStoryMembershipGeneration(result.data);
}

export async function loadActiveStoryMembershipGeneration(
  admin: SupabaseClient,
  ownerId: string,
): Promise<ActiveStoryMembershipGeneration | null> {
  const result = await admin
    .from("intelligence_story_dedup_generations")
    .select(STORY_GENERATION_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .eq("dedupe_version", INTELLIGENCE_STORY_DEDUP_VERSION)
    .maybeSingle();
  if (result.error) {
    throw new Error(`Active story membership generation lookup failed: ${result.error.message}`);
  }
  const parsed = parseStoryMembershipGeneration(result.data);
  return parsed?.status === "active"
    ? { ...parsed, status: "active" }
    : null;
}

export function isStoryClusterInGeneration(
  row: DbObject,
  generation: StoryMembershipGeneration | null,
) {
  const metadata = object(row.metadata);
  if (row.cluster_type !== "story") return false;
  if (generation) {
    return String(metadata.dedupe_version ?? "") === generation.dedupeVersion &&
      String(metadata.story_generation_id ?? "") === generation.generationId;
  }
  // Rolling-deploy fallback: before the first generation is activated, only
  // the last non-generation v2 set is readable. Staged v2.1 clusters remain
  // invisible even if a worker disappears before activation.
  return String(metadata.dedupe_version ?? "") === "story-dedup-v2.0.0" &&
    !metadata.story_generation_id;
}
