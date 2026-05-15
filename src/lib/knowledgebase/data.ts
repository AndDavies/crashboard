import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_cache } from "next/cache";

export const KNOWLEDGEBASE_PAGE_SIZE = 20;

export type KnowledgebaseSourceType =
  | "article"
  | "pdf"
  | "youtube_video"
  | "x_post"
  | "document"
  | "unknown";

export type KnowledgebaseReviewStatus =
  | "inbox"
  | "reviewed"
  | "archived"
  | "failed";

export type KnowledgebaseIngestionStatus =
  | "pending"
  | "ready"
  | "partial"
  | "failed";

export type KnowledgebaseTag = {
  id: string;
  tag: string;
  tagType: string;
  source: string;
  confidence: number | null;
};

export type KnowledgebaseDocumentListItem = {
  id: string;
  sourceType: KnowledgebaseSourceType;
  title: string | null;
  publisherName: string | null;
  authorName: string | null;
  summaryShort: string | null;
  reviewStatus: KnowledgebaseReviewStatus;
  ingestionStatus: KnowledgebaseIngestionStatus;
  urlHost: string | null;
  originalUrl: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  capturedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
  qualityFlags: Record<string, unknown>;
  tags: KnowledgebaseTag[];
};

export type KnowledgebaseCapture = {
  id: string;
  captureSource: string;
  chatId: string | null;
  messageId: string | null;
  threadId: string | null;
  senderId: string | null;
  senderLabel: string | null;
  rawText: string | null;
  capturedAt: string;
  metadata: Record<string, unknown>;
};

export type KnowledgebaseLink = {
  id: string;
  relation: string;
  url: string | null;
  toDocumentId: string | null;
  metadata: Record<string, unknown>;
};

export type KnowledgebaseDocumentDetail = KnowledgebaseDocumentListItem & {
  contentText: string | null;
  contentMarkdown: string | null;
  transcriptText: string | null;
  summaryMedium: string | null;
  language: string | null;
  extractionMethod: string | null;
  extractionVersion: string | null;
  metadata: Record<string, unknown>;
  captures: KnowledgebaseCapture[];
  links: KnowledgebaseLink[];
};

export type KnowledgebaseListFilters = {
  q?: string;
  source?: string;
  review?: string;
  ingestion?: string;
  tags?: string[];
  sort?: string;
  page?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function coerceListItem(row: Record<string, unknown>): KnowledgebaseDocumentListItem {
  return {
    id: String(row.id),
    sourceType: row.source_type as KnowledgebaseSourceType,
    title: typeof row.title === "string" ? row.title : null,
    publisherName: typeof row.publisher_name === "string" ? row.publisher_name : null,
    authorName: typeof row.author_name === "string" ? row.author_name : null,
    summaryShort: typeof row.summary_short === "string" ? row.summary_short : null,
    reviewStatus: row.review_status as KnowledgebaseReviewStatus,
    ingestionStatus: row.ingestion_status as KnowledgebaseIngestionStatus,
    urlHost: typeof row.url_host === "string" ? row.url_host : null,
    originalUrl: String(row.original_url),
    canonicalUrl: typeof row.canonical_url === "string" ? row.canonical_url : null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    capturedAt: typeof row.captured_at === "string" ? row.captured_at : null,
    createdAt: String(row.created_at),
    metadata: asRecord(row.metadata),
    qualityFlags: asRecord(row.quality_flags),
    tags: [],
  };
}

function normalizeWebsearchQuery(input: string) {
  return input
    .trim()
    .replace(/[()|&:*!']/g, " ")
    .replace(/\s+/g, " ");
}

async function getDocumentTags(documentIds: string[]) {
  if (documentIds.length === 0) return new Map<string, KnowledgebaseTag[]>();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("document_tags")
    .select("document_id, source, confidence, tag:tags(id, tag, tag_type)")
    .in("document_id", documentIds);

  if (error) throw new Error(error.message);

  const out = new Map<string, KnowledgebaseTag[]>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const documentId = String(row.document_id);
    const tagRow = row.tag as Record<string, unknown> | null;
    if (!tagRow?.id) continue;
    const tag: KnowledgebaseTag = {
      id: String(tagRow.id),
      tag: String(tagRow.tag ?? ""),
      tagType: String(tagRow.tag_type ?? ""),
      source: String(row.source ?? ""),
      confidence:
        typeof row.confidence === "number" ? row.confidence : row.confidence == null ? null : Number(row.confidence),
    };
    out.set(documentId, [...(out.get(documentId) ?? []), tag]);
  }

  for (const tags of out.values()) {
    tags.sort((a, b) => a.tag.localeCompare(b.tag));
  }

  return out;
}

async function getMatchingDocumentIdsForTags(tags: string[]): Promise<string[] | null> {
  const normalized = Array.from(
    new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  );
  if (normalized.length === 0) return null;

  const admin = createAdminClient();
  const { data: tagRows, error: tagError } = await admin
    .from("tags")
    .select("id")
    .in("tag_normalized", normalized);
  if (tagError) throw new Error(tagError.message);
  const tagIds = (tagRows ?? []).map((row) => String((row as Record<string, unknown>).id));
  if (tagIds.length === 0) return [];

  const { data: joins, error: joinError } = await admin
    .from("document_tags")
    .select("document_id")
    .in("tag_id", tagIds);
  if (joinError) throw new Error(joinError.message);
  return Array.from(new Set((joins ?? []).map((row) => String((row as Record<string, unknown>).document_id))));
}

export async function getKnowledgebaseList(filters: KnowledgebaseListFilters) {
  const admin = createAdminClient();
  const page = Math.max(1, Number(filters.page) || 1);
  const from = (page - 1) * KNOWLEDGEBASE_PAGE_SIZE;
  const to = from + KNOWLEDGEBASE_PAGE_SIZE - 1;

  let matchingIds: string[] | null = null;
  if (filters.tags?.length) {
    matchingIds = await getMatchingDocumentIdsForTags(filters.tags);
    if ((matchingIds ?? []).length === 0) {
      return {
        items: [] as KnowledgebaseDocumentListItem[],
        total: 0,
        page,
        pageSize: KNOWLEDGEBASE_PAGE_SIZE,
      };
    }
  }

  let query = admin
    .from("documents")
    .select(
      "id, source_type, title, publisher_name, author_name, summary_short, review_status, ingestion_status, url_host, original_url, canonical_url, published_at, captured_at, created_at, metadata, quality_flags",
      { count: "exact" },
    );

  if (filters.source) query = query.eq("source_type", filters.source);
  if (filters.review) query = query.eq("review_status", filters.review);
  if (filters.ingestion) query = query.eq("ingestion_status", filters.ingestion);
  if (matchingIds) query = query.in("id", matchingIds);
  if (filters.q?.trim()) {
    const q = normalizeWebsearchQuery(filters.q);
    if (q) {
      query = query.textSearch("search_document", q, {
        type: "websearch",
        config: "english",
      });
    }
  }

  switch (filters.sort) {
    case "published_desc":
      query = query.order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "captured_asc":
      query = query.order("captured_at", { ascending: true, nullsFirst: false });
      break;
    case "title_asc":
      query = query.order("title", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("captured_at", { ascending: false, nullsFirst: false });
      break;
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => coerceListItem(row as Record<string, unknown>));
  const tagsByDocumentId = await getDocumentTags(items.map((item) => item.id));
  for (const item of items) {
    item.tags = tagsByDocumentId.get(item.id) ?? [];
  }

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize: KNOWLEDGEBASE_PAGE_SIZE,
  };
}

const getCachedKnowledgebaseSummaryStats = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const [{ count: total }, { count: inbox }, { count: reviewed }, { count: issueCount }] = await Promise.all([
      admin.from("documents").select("id", { count: "exact", head: true }),
      admin.from("documents").select("id", { count: "exact", head: true }).eq("review_status", "inbox"),
      admin.from("documents").select("id", { count: "exact", head: true }).eq("review_status", "reviewed"),
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .in("ingestion_status", ["partial", "failed"]),
    ]);

    return {
      total: total ?? 0,
      inbox: inbox ?? 0,
      reviewed: reviewed ?? 0,
      issues: issueCount ?? 0,
    };
  },
  ["knowledgebase-summary-stats"],
  { revalidate: 30 },
);

export async function getKnowledgebaseSummaryStats() {
  return getCachedKnowledgebaseSummaryStats();
}

const getCachedKnowledgebaseFilterOptions = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tags")
      .select("tag, tag_normalized, tag_type")
      .order("tag_normalized", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      label: String((row as Record<string, unknown>).tag ?? ""),
      value: String((row as Record<string, unknown>).tag_normalized ?? ""),
      tagType: String((row as Record<string, unknown>).tag_type ?? ""),
    }));
  },
  ["knowledgebase-filter-options"],
  { revalidate: 300 },
);

export async function getKnowledgebaseFilterOptions() {
  return getCachedKnowledgebaseFilterOptions();
}

export async function getKnowledgebaseDocument(documentId: string): Promise<KnowledgebaseDocumentDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const base = coerceListItem(data as Record<string, unknown>);

  const [{ data: captures, error: captureError }, { data: links, error: linkError }] = await Promise.all([
    admin
      .from("document_captures")
      .select("id, capture_source, chat_id, message_id, thread_id, sender_id, sender_label, raw_text, captured_at, metadata")
      .eq("document_id", documentId)
      .order("captured_at", { ascending: false }),
    admin
      .from("document_links")
      .select("id, relation, url, to_document_id, metadata")
      .eq("from_document_id", documentId)
      .order("created_at", { ascending: false }),
  ]);
  if (captureError) throw new Error(captureError.message);
  if (linkError) throw new Error(linkError.message);

  const tagsByDocumentId = await getDocumentTags([documentId]);

  return {
    ...base,
    contentText: typeof data.content_text === "string" ? data.content_text : null,
    contentMarkdown: typeof data.content_markdown === "string" ? data.content_markdown : null,
    transcriptText: typeof data.transcript_text === "string" ? data.transcript_text : null,
    summaryMedium: typeof data.summary_medium === "string" ? data.summary_medium : null,
    language: typeof data.language === "string" ? data.language : null,
    extractionMethod: typeof data.extraction_method === "string" ? data.extraction_method : null,
    extractionVersion: typeof data.extraction_version === "string" ? data.extraction_version : null,
    metadata: asRecord(data.metadata),
    captures: (captures ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      captureSource: String((row as Record<string, unknown>).capture_source ?? ""),
      chatId: ((row as Record<string, unknown>).chat_id as string | null) ?? null,
      messageId: ((row as Record<string, unknown>).message_id as string | null) ?? null,
      threadId: ((row as Record<string, unknown>).thread_id as string | null) ?? null,
      senderId: ((row as Record<string, unknown>).sender_id as string | null) ?? null,
      senderLabel: ((row as Record<string, unknown>).sender_label as string | null) ?? null,
      rawText: ((row as Record<string, unknown>).raw_text as string | null) ?? null,
      capturedAt: String((row as Record<string, unknown>).captured_at),
      metadata: asRecord((row as Record<string, unknown>).metadata),
    })),
    links: (links ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      relation: String((row as Record<string, unknown>).relation ?? ""),
      url: ((row as Record<string, unknown>).url as string | null) ?? null,
      toDocumentId: ((row as Record<string, unknown>).to_document_id as string | null) ?? null,
      metadata: asRecord((row as Record<string, unknown>).metadata),
    })),
    tags: tagsByDocumentId.get(documentId) ?? [],
  };
}

export async function updateKnowledgebaseReviewStatus(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Authentication required.");
  }

  const documentId = String(formData.get("documentId") ?? "").trim();
  const reviewStatus = String(formData.get("reviewStatus") ?? "").trim();

  if (!documentId) throw new Error("Missing document id.");
  if (!["inbox", "reviewed", "archived", "failed"].includes(reviewStatus)) {
    throw new Error("Invalid review status.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("documents")
    .update({ review_status: reviewStatus, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw new Error(error.message);

  revalidatePath("/wiki");
}
