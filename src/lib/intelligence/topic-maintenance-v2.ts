import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sha256Hex } from "@/lib/ingestion/hash";
import {
  createEmbeddings,
  INTELLIGENCE_EMBEDDING_MODEL,
} from "@/lib/intelligence/enrichment";
import { normalizeConceptKey } from "@/lib/intelligence/concepts";
import { INTELLIGENCE_TERM_EXTRACTION_VERSION } from "@/lib/intelligence/term-observations";

export const INTELLIGENCE_TOPIC_MAINTENANCE_VERSION = "topic-maintenance-v2.2.0";
export const TOPIC_ASSIGNMENT_SIMILARITY = 0.84;
export const TOPIC_REVIEW_SIMILARITY = 0.80;
export const TOPIC_AUTO_MERGE_SIMILARITY = 0.92;
export const TOPIC_GRAPH_SIMILARITY = 0.80;

// The current six-month corpus is comfortably below this bound. Loading one
// complete window keeps connected components from changing at arbitrary page
// boundaries; the cursor remains as a safety valve for a future larger corpus.
const DEFAULT_SEGMENT_LIMIT = 10_000;
const MAX_SEGMENT_LIMIT = 10_000;
const INPUT_PAGE_SIZE = 1_000;
const DEFAULT_NEIGHBOURS = 6;
const TOPIC_NAMING_TIMEOUT_MS = 45_000;
const TOPIC_MODEL = process.env.OPENAI_INTELLIGENCE_TOPIC_MODEL?.trim() ||
  process.env.OPENAI_INTELLIGENCE_EXTRACTION_MODEL?.trim() || "gpt-5.4-mini";

type DbRow = Record<string, unknown>;

export type TopicGraphNode = {
  id: string;
  documentId: string;
  sourceFamily: string;
  embedding: number[];
};

export type TopicGraphEdge = {
  left: string;
  right: string;
  similarity: number;
};

export type TopicGraphComponent = {
  id: string;
  nodes: TopicGraphNode[];
  sourceFamilies: string[];
  edges: TopicGraphEdge[];
};

export type TopicTermEvidence = {
  componentId: string;
  normalizedTerm: string;
  displayTerm: string;
  kind: "keyword" | "phrase" | "acronym" | "identifier";
  count: number;
  titleCount: number;
  salience: number;
};

export type RepresentativePhrase = {
  normalizedTerm: string;
  displayTerm: string;
  kind: TopicTermEvidence["kind"];
  score: number;
  count: number;
};

const TopicNameSchema = z.object({
  label: z.string().min(2).max(120),
  description: z.string().min(20).max(600),
  domain: z.string().min(2).max(80),
  subdomain: z.string().max(100),
  aliases: z.array(z.string().min(2).max(120)).max(10),
}).strict();

type TopicName = z.infer<typeof TopicNameSchema>;

export type TopicAssignmentDecision =
  | { action: "exact_alias"; conceptId: string; similarity: 1 }
  | { action: "auto_merge"; conceptId: string; similarity: number }
  | { action: "candidate_with_suggestion"; conceptId: string; similarity: number }
  | { action: "new_candidate"; conceptId: null; similarity: number };

export type SegmentTopicTerm = {
  normalizedTerm: string;
  displayTerm?: string;
  count?: number;
  titleCount?: number;
  salience?: number;
};

export type ExistingTopicVector = {
  conceptId: string;
  domain: string;
  embedding: number[];
};

export type SegmentTopicAssignmentDecision =
  | {
      action: "exact_alias";
      conceptId: string;
      similarity: 1;
      matchedTerm: string;
    }
  | {
      action: "semantic";
      conceptId: string;
      similarity: number;
      matchedTerm: null;
    }
  | {
      action: "unassigned";
      conceptId: null;
      similarity: number;
      matchedTerm: null;
    };

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] ** 2;
    magnitudeB += b[index] ** 2;
  }
  return magnitudeA && magnitudeB ? dot / Math.sqrt(magnitudeA * magnitudeB) : 0;
}

export function decideTopicAssignment(input: {
  normalizedLabel: string;
  exactAliases: Map<string, string>;
  nearest?: { conceptId: string; similarity: number } | null;
}): TopicAssignmentDecision {
  const exact = input.exactAliases.get(input.normalizedLabel);
  if (exact) return { action: "exact_alias", conceptId: exact, similarity: 1 };
  const nearest = input.nearest;
  if (nearest && nearest.similarity >= TOPIC_AUTO_MERGE_SIMILARITY) {
    return { action: "auto_merge", ...nearest };
  }
  if (nearest && nearest.similarity >= TOPIC_REVIEW_SIMILARITY) {
    return { action: "candidate_with_suggestion", ...nearest };
  }
  return { action: "new_candidate", conceptId: null, similarity: nearest?.similarity ?? 0 };
}

/**
 * Assigns one previously unassigned editorial segment before topic discovery.
 * Exact canonical labels/aliases always win. Semantic assignment is restricted
 * to the segment's inferred domain and must clear the explicit 0.84 gate.
 */
export function decideSegmentTopicAssignment(input: {
  terms: SegmentTopicTerm[];
  exactAliases: Map<string, string>;
  segmentDomain: string;
  segmentEmbedding: number[];
  concepts: ExistingTopicVector[];
}): SegmentTopicAssignmentDecision {
  const exactMatches = input.terms.flatMap((term) => {
    const normalizedTerm = normalizeConceptKey(term.normalizedTerm);
    const conceptId = input.exactAliases.get(normalizedTerm);
    return conceptId
      ? [{
          conceptId,
          normalizedTerm,
          titleCount: Math.max(0, Number(term.titleCount ?? 0)),
          salience: Math.max(0, Math.min(1, Number(term.salience ?? 0))),
          count: Math.max(0, Number(term.count ?? 0)),
        }]
      : [];
  }).sort((left, right) =>
    right.titleCount - left.titleCount ||
    right.salience - left.salience ||
    right.count - left.count ||
    right.normalizedTerm.length - left.normalizedTerm.length ||
    left.normalizedTerm.localeCompare(right.normalizedTerm) ||
    left.conceptId.localeCompare(right.conceptId)
  );
  const exact = exactMatches[0];
  if (exact) {
    return {
      action: "exact_alias",
      conceptId: exact.conceptId,
      similarity: 1,
      matchedTerm: exact.normalizedTerm,
    };
  }

  let nearest: { conceptId: string; similarity: number } | null = null;
  for (const concept of input.concepts) {
    if (domainKey(concept.domain) !== domainKey(input.segmentDomain)) continue;
    const similarity = cosineSimilarity(input.segmentEmbedding, concept.embedding);
    if (!nearest || similarity > nearest.similarity ||
      (similarity === nearest.similarity && concept.conceptId < nearest.conceptId)) {
      nearest = { conceptId: concept.conceptId, similarity };
    }
  }
  if (nearest && nearest.similarity >= TOPIC_ASSIGNMENT_SIMILARITY) {
    return {
      action: "semantic",
      conceptId: nearest.conceptId,
      similarity: nearest.similarity,
      matchedTerm: null,
    };
  }
  return {
    action: "unassigned",
    conceptId: null,
    similarity: nearest?.similarity ?? 0,
    matchedTerm: null,
  };
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.parent.get(value) ?? value;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    this.parent.set(
      leftRoot > rightRoot ? leftRoot : rightRoot,
      leftRoot > rightRoot ? rightRoot : leftRoot,
    );
  }
}

/**
 * Builds a bounded k-nearest-neighbour graph and returns its connected
 * components. Edges are retained only above the configured cosine threshold.
 */
export function buildNearestNeighbourGraph(
  nodes: TopicGraphNode[],
  options: { similarity?: number; neighbours?: number } = {},
) {
  const similarityThreshold = Math.min(
    0.99,
    Math.max(0, options.similarity ?? TOPIC_GRAPH_SIMILARITY),
  );
  const neighbourLimit = Math.min(20, Math.max(1, options.neighbours ?? DEFAULT_NEIGHBOURS));
  const set = new DisjointSet();
  const edgeByKey = new Map<string, TopicGraphEdge>();
  for (const node of nodes) set.add(node.id);

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex];
    const nearest: Array<{ node: TopicGraphNode; similarity: number }> = [];
    for (let rightIndex = 0; rightIndex < nodes.length; rightIndex += 1) {
      if (leftIndex === rightIndex) continue;
      const right = nodes[rightIndex];
      const similarity = cosineSimilarity(left.embedding, right.embedding);
      if (similarity < similarityThreshold) continue;
      nearest.push({ node: right, similarity });
    }
    nearest.sort((a, b) => b.similarity - a.similarity || a.node.id.localeCompare(b.node.id));
    for (const candidate of nearest.slice(0, neighbourLimit)) {
      const [first, second] = [left.id, candidate.node.id].sort();
      const key = `${first}|${second}`;
      const existing = edgeByKey.get(key);
      if (!existing || candidate.similarity > existing.similarity) {
        edgeByKey.set(key, {
          left: first,
          right: second,
          similarity: candidate.similarity,
        });
      }
      set.union(first, second);
    }
  }

  const nodeGroups = new Map<string, TopicGraphNode[]>();
  for (const node of nodes) {
    const root = set.find(node.id);
    const group = nodeGroups.get(root) ?? [];
    group.push(node);
    nodeGroups.set(root, group);
  }
  const edges = [...edgeByKey.values()];
  const components = [...nodeGroups.values()].map((componentNodes) => {
    const nodeIds = new Set(componentNodes.map((node) => node.id));
    const sortedIds = [...nodeIds].sort();
    return {
      id: sortedIds.join("|"),
      nodes: [...componentNodes].sort((a, b) => a.id.localeCompare(b.id)),
      sourceFamilies: [...new Set(componentNodes.map((node) => node.sourceFamily))].sort(),
      edges: edges.filter((edge) => nodeIds.has(edge.left) && nodeIds.has(edge.right)),
    } satisfies TopicGraphComponent;
  }).sort((a, b) => b.nodes.length - a.nodes.length || a.id.localeCompare(b.id));

  return { edges, components };
}

export function qualifyingTopicComponents(
  components: TopicGraphComponent[],
  options: { minimumItems?: number; minimumSourceFamilies?: number } = {},
) {
  const minimumItems = Math.max(2, options.minimumItems ?? 5);
  const minimumSourceFamilies = Math.max(2, options.minimumSourceFamilies ?? 3);
  return components.filter((component) =>
    component.nodes.length >= minimumItems &&
    component.sourceFamilies.length >= minimumSourceFamilies
  );
}

function kindBoost(kind: TopicTermEvidence["kind"]) {
  if (kind === "phrase") return 1.25;
  if (kind === "acronym" || kind === "identifier") return 1.15;
  return 1;
}

/**
 * Computes representative phrases with class-based TF-IDF. Each connected
 * component is treated as one class, keeping phrases that distinguish it from
 * the other candidate components while preserving acronyms and identifiers.
 */
export function classBasedTfidf(
  evidence: TopicTermEvidence[],
  options: { limit?: number } = {},
) {
  const limit = Math.min(30, Math.max(1, options.limit ?? 12));
  const componentIds = [...new Set(evidence.map((row) => row.componentId))];
  const classes = Math.max(1, componentIds.length);
  const documentFrequency = new Map<string, Set<string>>();
  for (const row of evidence) {
    const components = documentFrequency.get(row.normalizedTerm) ?? new Set<string>();
    components.add(row.componentId);
    documentFrequency.set(row.normalizedTerm, components);
  }

  const result = new Map<string, RepresentativePhrase[]>();
  for (const componentId of componentIds) {
    const rows = evidence.filter((row) => row.componentId === componentId);
    const combined = new Map<string, TopicTermEvidence>();
    for (const row of rows) {
      const existing = combined.get(row.normalizedTerm);
      if (!existing) {
        combined.set(row.normalizedTerm, { ...row });
        continue;
      }
      existing.count += row.count;
      existing.titleCount += row.titleCount;
      existing.salience = Math.max(existing.salience, row.salience);
      if (row.displayTerm.length < existing.displayTerm.length) {
        existing.displayTerm = row.displayTerm;
      }
      if (kindBoost(row.kind) > kindBoost(existing.kind)) existing.kind = row.kind;
    }
    const total = Math.max(1, [...combined.values()].reduce((sum, row) => sum + row.count, 0));
    const ranked = [...combined.values()].map((row) => {
      const tf = row.count / total;
      const df = documentFrequency.get(row.normalizedTerm)?.size ?? 1;
      const idf = Math.log((classes + 1) / (df + 1)) + 1;
      const salience = 0.8 + Math.min(1, row.salience) * 0.4;
      const title = 1 + Math.min(1, row.titleCount) * 0.2;
      return {
        normalizedTerm: row.normalizedTerm,
        displayTerm: row.displayTerm,
        kind: row.kind,
        score: tf * idf * kindBoost(row.kind) * salience * title,
        count: row.count,
      } satisfies RepresentativePhrase;
    }).sort((a, b) => b.score - a.score || b.count - a.count ||
      a.normalizedTerm.localeCompare(b.normalizedTerm));
    result.set(componentId, ranked.slice(0, limit));
  }
  return result;
}

export function meanEmbedding(values: number[][]) {
  const dimension = values[0]?.length ?? 0;
  if (!dimension || values.some((value) => value.length !== dimension)) return [];
  const mean = Array.from({ length: dimension }, () => 0);
  for (const value of values) {
    for (let index = 0; index < dimension; index += 1) mean[index] += value[index];
  }
  const magnitude = Math.sqrt(mean.reduce((sum, value) => sum + value ** 2, 0));
  return magnitude ? mean.map((value) => value / magnitude) : mean;
}

function vector(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value !== "string") return [];
  return value.replace(/^\[|\]$/gu, "").split(",").map(Number).filter(Number.isFinite);
}

function vectorLiteral(value: number[]) {
  return `[${value.map((item) => Number(item.toFixed(8))).join(",")}]`;
}

export async function refreshConceptEmbeddingsBatch(
  admin: SupabaseClient,
  ownerId: string,
  options: { cursor?: number; limit?: number } = {},
) {
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0));
  const limit = Math.min(25, Math.max(1, Math.floor(options.limit ?? 10)));
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for concept embedding backfill.");
  const concepts = await admin.from("intelligence_concepts")
    .select("id,canonical_label,domain,subdomain,description,taxonomy_version")
    .eq("owner_id", ownerId).in("status", ["active", "candidate"])
    .order("id", { ascending: true }).range(cursor, cursor + limit - 1);
  if (concepts.error) throw new Error(concepts.error.message);
  const conceptIds = (concepts.data ?? []).map((row) => String(row.id));
  const existing = conceptIds.length
    ? await admin.from("intelligence_concept_embeddings")
      .select("concept_id,taxonomy_version")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .in("concept_id", conceptIds)
    : { data: [], error: null };
  if (existing.error) throw new Error(existing.error.message);
  const existingKeys = new Set((existing.data ?? []).map((row) =>
    `${row.concept_id}|${row.taxonomy_version}`
  ));
  const client = new OpenAI({ apiKey });
  let embedded = 0;
  let skipped = 0;
  const conceptRows = concepts.data ?? [];
  const pending = conceptRows.filter((concept) => {
    const taxonomyVersion = String(concept.taxonomy_version);
    if (existingKeys.has(`${concept.id}|${taxonomyVersion}`)) {
      skipped += 1;
      return false;
    }
    return true;
  });
  for (let from = 0; from < pending.length; from += 5) {
    const group = pending.slice(from, from + 5);
    const embeddings = await createEmbeddings(
      group.map((concept) =>
        [concept.canonical_label, concept.description, concept.domain, concept.subdomain]
          .filter(Boolean).join(". ")
      ),
      { client },
    );
    await Promise.all(group.map(async (concept, groupIndex) => {
      try {
        const taxonomyVersion = String(concept.taxonomy_version);
        const embedding = embeddings[groupIndex];
        if (!embedding?.length) throw new Error("Embedding batch did not return this concept.");
        const write = await admin.from("intelligence_concept_embeddings").upsert({
          owner_id: ownerId,
          concept_id: concept.id,
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
          embedding: vectorLiteral(embedding),
          taxonomy_version: taxonomyVersion,
          updated_at: new Date().toISOString(),
        }, { onConflict: "concept_id,embedding_model,taxonomy_version" });
        if (write.error) throw new Error(write.error.message);
        embedded += 1;
      } catch (error) {
        throw new Error(
          `Concept ${concept.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }));
  }
  const processed = concepts.data?.length ?? 0;
  return {
    phase: "concept_embeddings" as const,
    cursor,
    processed,
    embedded,
    skipped,
    hasMore: processed === limit,
    nextCursor: processed === limit ? cursor + processed : null,
  };
}

function domainFor(value: string) {
  const label = value.toLocaleLowerCase("en-CA");
  if (/\b(defen[cs]e|military|missile|munition|counter-?uas|radar|weapon|nato)\b/u.test(label)) return "Defence";
  if (/\b(cyber|ransomware|malware|zero trust)\b/u.test(label)) return "Cybersecurity";
  if (/\b(ai|artificial intelligence|machine learning|llm|model)\b/u.test(label)) return "AI";
  return "General";
}

function domainKey(value: unknown) {
  const normalized = normalizeConceptKey(String(value ?? "General"));
  if (/defen[cs]e|military|nato/u.test(normalized)) return "defence";
  if (/cyber|security/u.test(normalized)) return "cybersecurity";
  if (/(^| )ai( |$)|artificial intelligence|machine learning/u.test(normalized)) return "ai";
  return normalized || "general";
}

function chunks<T>(values: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += INPUT_PAGE_SIZE) {
    const result = await query(from, from + INPUT_PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < INPUT_PAGE_SIZE) return rows;
  }
}

async function fetchBoundedRows<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  cursor: number,
  limit: number,
) {
  const rows: T[] = [];
  const target = limit + 1;
  let offset = cursor;
  while (rows.length < target) {
    const requested = Math.min(INPUT_PAGE_SIZE, target - rows.length);
    const result = await query(offset, offset + requested - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    offset += page.length;
    if (page.length < requested) break;
  }
  return {
    rows: rows.slice(0, limit),
    hasMore: rows.length > limit,
  };
}

function nested(value: unknown): DbRow {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as DbRow : {};
}

function fallbackTopicName(phrases: RepresentativePhrase[]): TopicName {
  const label = phrases[0]?.displayTerm ?? "Emerging topic";
  const domain = domainFor(phrases.slice(0, 8).map((phrase) => phrase.displayTerm).join(" "));
  return {
    label,
    description: `Emerging coverage around ${label}, derived from related editorial items and representative terminology.`,
    domain,
    subdomain: "Emerging",
    aliases: phrases.slice(1, 6).map((phrase) => phrase.displayTerm),
  };
}

async function nameTopic(
  client: OpenAI | null,
  component: TopicGraphComponent,
  phrases: RepresentativePhrase[],
  segmentById: Map<string, DbRow>,
) {
  const fallback = fallbackTopicName(phrases);
  if (!client) return { value: fallback, method: "deterministic" as const, error: null };
  try {
    const excerpts = component.nodes.slice(0, 5).map((node) => {
      const segment = segmentById.get(node.id) ?? {};
      return {
        title: String(segment.title ?? "").slice(0, 180),
        excerpt: String(segment.content_text ?? "").replace(/\s+/gu, " ").slice(0, 600),
      };
    });
    const response = await client.responses.parse({
      model: TOPIC_MODEL,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: `Name a stable strategic-intelligence topic represented by a cluster of related editorial passages.

Rules:
- Name the durable subject, not a single announcement or a newsletter headline.
- Prefer precise defence, technology, organization, programme, system, policy, or market terminology.
- Preserve meaningful acronyms and identifiers in aliases.
- Avoid generic labels such as news, technology, industry, update, funding, or defence unless a more specific subject is impossible.
- The description must state what belongs in the topic without inventing causes or facts.
- Use a broad domain such as Defence, Cybersecurity, AI, Business, Space, Energy, or Policy.
- Return only structured output.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            supportItems: component.nodes.length,
            sourceFamilies: component.sourceFamilies.length,
            representativePhrases: phrases.slice(0, 12),
            excerpts,
          }),
        },
      ],
      text: { format: zodTextFormat(TopicNameSchema, "intelligence_topic_name") },
    }, { timeout: TOPIC_NAMING_TIMEOUT_MS, maxRetries: 0 });
    if (!response.output_parsed) throw new Error("No structured topic name returned.");
    return { value: response.output_parsed, method: "structured_model" as const, error: null };
  } catch (error) {
    return {
      value: fallback,
      method: "deterministic" as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchTopicInputs(
  admin: SupabaseClient,
  ownerId: string,
  input: { cursor: number; limit: number; since: string },
) {
  const embeddingPage = await fetchBoundedRows<DbRow>(
    (from, to) => admin.from("intelligence_segment_embeddings")
      .select("segment_id,embedding")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .order("segment_id", { ascending: true })
      .range(from, to),
    input.cursor,
    input.limit,
  );
  const embeddingRows = embeddingPage.rows;
  const segmentIds = embeddingRows.map((row) => String(row.segment_id));
  if (!segmentIds.length) {
    return {
      scanned: 0,
      hasMore: false,
      nodes: [] as TopicGraphNode[],
      segmentById: new Map<string, DbRow>(),
      terms: [] as DbRow[],
    };
  }

  const assignedRows: DbRow[] = [];
  for (const segmentIdChunk of chunks(segmentIds)) {
    assignedRows.push(...await fetchAllRows<DbRow>((from, to) =>
      admin.from("intelligence_document_concepts")
        .select("segment_id")
        .eq("owner_id", ownerId)
        .in("segment_id", segmentIdChunk)
        .gte("confidence", 0.6)
        .range(from, to)
    ));
  }
  const assignedIds = new Set(assignedRows.map((row) => String(row.segment_id)));
  const unassignedIds = segmentIds.filter((segmentId) => !assignedIds.has(segmentId));
  const segmentRows: DbRow[] = [];
  const termRows: DbRow[] = [];
  for (const segmentIdChunk of chunks(unassignedIds)) {
    const [segments, terms] = await Promise.all([
      fetchAllRows<DbRow>((from, to) => admin.from("intelligence_document_segments")
        .select("id,document_id,title,content_text,segment_type,exclusion_reason,documents!inner(published_at,created_at,source_identity_id)")
        .eq("owner_id", ownerId)
        .in("id", segmentIdChunk)
        .in("segment_type", ["editorial", "unknown"])
        .is("exclusion_reason", null)
        .range(from, to)),
      fetchAllRows<DbRow>((from, to) => admin.from("intelligence_term_observations")
        .select("segment_id,normalized_term,display_term,term_kind,occurrence_count,title_count,salience")
        .eq("owner_id", ownerId)
        .eq("extraction_version", INTELLIGENCE_TERM_EXTRACTION_VERSION)
        .in("segment_id", segmentIdChunk)
        .range(from, to)),
    ]);
    segmentRows.push(...segments);
    termRows.push(...terms);
  }
  const eligibleSegments = segmentRows.filter((row) => {
    const document = nested(row.documents);
    const publishedAt = String(document.published_at ?? document.created_at ?? "").slice(0, 10);
    return publishedAt >= input.since && !assignedIds.has(String(row.id));
  });
  const identityIds = [...new Set(eligibleSegments.map((row) =>
    String(nested(row.documents).source_identity_id ?? "")
  ).filter(Boolean))];
  const identityFamilies = new Map<string, string>();
  for (const identityChunk of chunks(identityIds)) {
    const identities = await fetchAllRows<DbRow>((from, to) =>
      admin.from("intelligence_source_identities")
        .select("id,normalized_family,source_family")
        .eq("owner_id", ownerId)
        .in("id", identityChunk)
        .range(from, to)
    );
    for (const row of identities) {
      identityFamilies.set(
        String(row.id),
        String(row.normalized_family ?? row.source_family ?? row.id),
      );
    }
  }
  const embeddingBySegment = new Map(
    embeddingRows.map((row) => [String(row.segment_id), vector(row.embedding)]),
  );
  const segmentById = new Map(eligibleSegments.map((row) => [String(row.id), row]));
  const nodes = eligibleSegments.flatMap((row): TopicGraphNode[] => {
    const embedding = embeddingBySegment.get(String(row.id)) ?? [];
    if (!embedding.length) return [];
    const document = nested(row.documents);
    const identityId = String(document.source_identity_id ?? "");
    return [{
      id: String(row.id),
      documentId: String(row.document_id),
      sourceFamily: identityFamilies.get(identityId) ?? `document:${row.document_id}`,
      embedding,
    }];
  });
  const eligibleIds = new Set(nodes.map((node) => node.id));
  return {
    scanned: embeddingRows.length,
    hasMore: embeddingPage.hasMore,
    nodes,
    segmentById,
    terms: termRows.filter((row) => eligibleIds.has(String(row.segment_id))),
  };
}

async function writeAliases(
  admin: SupabaseClient,
  ownerId: string,
  conceptId: string,
  values: string[],
  source: "rule" | "model",
  confidence: number,
) {
  const rows = [...new Map(values.map((value) => ({
    alias: value.trim(),
    normalized: normalizeConceptKey(value),
  })).filter((value) => value.alias && value.normalized)
    .map((value) => [value.normalized, value])).values()]
    .map((value) => ({
      owner_id: ownerId,
      concept_id: conceptId,
      alias: value.alias,
      normalized_alias: value.normalized,
      source,
      confidence,
      metadata: { maintenance_version: INTELLIGENCE_TOPIC_MAINTENANCE_VERSION },
    }));
  if (!rows.length) return;
  const result = await admin.from("intelligence_concept_aliases").upsert(rows, {
    onConflict: "concept_id,normalized_alias",
  });
  if (result.error) throw new Error(result.error.message);
}

function segmentTerms(rows: DbRow[]): SegmentTopicTerm[] {
  return rows.map((row) => ({
    normalizedTerm: String(row.normalized_term ?? ""),
    displayTerm: String(row.display_term ?? row.normalized_term ?? ""),
    count: Math.min(5, Math.max(0, Number(row.occurrence_count ?? 0))),
    titleCount: Math.max(0, Number(row.title_count ?? 0)),
    salience: Math.max(0, Math.min(1, Number(row.salience ?? 0))),
  })).filter((term) => Boolean(term.normalizedTerm));
}

function inferSegmentDomain(segment: DbRow, terms: SegmentTopicTerm[]) {
  return domainFor([
    String(segment.title ?? ""),
    terms.slice(0, 20).map((term) => term.displayTerm ?? term.normalizedTerm).join(" "),
    String(segment.content_text ?? "").slice(0, 2_000),
  ].join(" "));
}

async function linkDirectSegmentAssignments(
  admin: SupabaseClient,
  ownerId: string,
  assignments: Array<{
    node: TopicGraphNode;
    segment: DbRow;
    domain: string;
    terms: SegmentTopicTerm[];
    decision: Exclude<SegmentTopicAssignmentDecision, { action: "unassigned" }>;
  }>,
) {
  const rows = assignments.map(({ node, segment, domain, terms, decision }) => {
    const matched = decision.matchedTerm
      ? terms.find((term) => normalizeConceptKey(term.normalizedTerm) === decision.matchedTerm)
      : null;
    const surfaceForms = decision.action === "exact_alias"
      ? [matched?.displayTerm ?? decision.matchedTerm]
      : terms.slice(0, 8).map((term) => term.displayTerm ?? term.normalizedTerm);
    return {
      owner_id: ownerId,
      association_key:
        `${node.documentId}:${node.id}:${decision.conceptId}:topic_maintenance:${decision.action}`,
      document_id: node.documentId,
      segment_id: node.id,
      concept_id: decision.conceptId,
      scope: "segment_body",
      source: decision.action === "exact_alias" ? "rule" : "model",
      mention_count: decision.action === "exact_alias"
        ? Math.max(1, Math.min(5, Number(matched?.count ?? 1)))
        : 1,
      confidence: decision.action === "exact_alias" ? 0.98 : decision.similarity,
      evidence_text:
        String(segment.content_text ?? "").replace(/\s+/gu, " ").slice(0, 500) || null,
      surface_forms: [...new Set(surfaceForms.filter(Boolean))],
      extraction_version: INTELLIGENCE_TOPIC_MAINTENANCE_VERSION,
      metadata: {
        assignment_method: decision.action,
        assignment_similarity: decision.similarity,
        assignment_threshold: decision.action === "semantic"
          ? TOPIC_ASSIGNMENT_SIMILARITY
          : 1,
        segment_domain: domain,
      },
      updated_at: new Date().toISOString(),
    };
  });
  for (const rowChunk of chunks(rows, 250)) {
    const result = await admin.from("intelligence_document_concepts").upsert(rowChunk, {
      onConflict: "owner_id,association_key",
    });
    if (result.error) throw new Error(result.error.message);
  }
  return rows.length;
}

async function linkComponentSegments(
  admin: SupabaseClient,
  ownerId: string,
  conceptId: string,
  component: TopicGraphComponent,
  segmentById: Map<string, DbRow>,
  phrases: RepresentativePhrase[],
  confidence: number,
) {
  const surfaceForms = phrases.slice(0, 8).map((phrase) => phrase.displayTerm);
  const rows = component.nodes.map((node) => {
    const segment = segmentById.get(node.id) ?? {};
    return {
      owner_id: ownerId,
      association_key: `${node.documentId}:${node.id}:${conceptId}:topic_maintenance:model`,
      document_id: node.documentId,
      segment_id: node.id,
      concept_id: conceptId,
      scope: "segment_body",
      source: "model",
      mention_count: 1,
      confidence,
      evidence_text: String(segment.content_text ?? "").replace(/\s+/gu, " ").slice(0, 500) || null,
      surface_forms: surfaceForms,
      extraction_version: INTELLIGENCE_TOPIC_MAINTENANCE_VERSION,
      metadata: {
        graph_component: sha256Hex(component.id),
        representative_phrases: surfaceForms,
      },
      updated_at: new Date().toISOString(),
    };
  });
  for (const rowChunk of chunks(rows, 250)) {
    const result = await admin.from("intelligence_document_concepts").upsert(rowChunk, {
      onConflict: "owner_id,association_key",
    });
    if (result.error) throw new Error(result.error.message);
  }
  return rows.length;
}

export async function runTopicMaintenance(
  admin: SupabaseClient,
  ownerId: string,
  options: {
    maxCandidates?: number;
    lookbackDays?: number;
    cursor?: number;
    segmentLimit?: number;
    graphSimilarity?: number;
    neighbours?: number;
  } = {},
) {
  const maxCandidates = Math.min(12, Math.max(1, options.maxCandidates ?? 5));
  const lookbackDays = Math.min(180, Math.max(28, options.lookbackDays ?? 90));
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0));
  const segmentLimit = Math.min(
    MAX_SEGMENT_LIMIT,
    Math.max(25, Math.floor(options.segmentLimit ?? DEFAULT_SEGMENT_LIMIT)),
  );
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const [input, concepts, aliases, conceptEmbeddingRows] = await Promise.all([
    fetchTopicInputs(admin, ownerId, { cursor, limit: segmentLimit, since }),
    fetchAllRows<DbRow>((from, to) => admin.from("intelligence_concepts")
      .select("id,concept_type,canonical_label,normalized_key,domain,status,metadata")
      .eq("owner_id", ownerId)
      .in("status", ["active", "candidate"])
      .order("status", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRows<DbRow>((from, to) => admin.from("intelligence_concept_aliases")
      .select("concept_id,normalized_alias")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRows<DbRow>((from, to) => admin.from("intelligence_concept_embeddings")
      .select("concept_id,embedding")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .order("id", { ascending: true })
      .range(from, to)),
  ]);

  const exactAliases = new Map<string, string>();
  for (const concept of concepts) {
    const normalizedLabels = [
      normalizeConceptKey(String(concept.canonical_label ?? "")),
      normalizeConceptKey(String(concept.normalized_key ?? "")),
    ].filter(Boolean);
    for (const normalized of normalizedLabels) {
      if (!exactAliases.has(normalized)) exactAliases.set(normalized, String(concept.id));
    }
  }
  for (const alias of aliases) {
    const normalized = normalizeConceptKey(String(alias.normalized_alias ?? ""));
    if (normalized && !exactAliases.has(normalized)) {
      exactAliases.set(normalized, String(alias.concept_id));
    }
  }
  const embeddingByConcept = new Map(
    conceptEmbeddingRows.map((row) => [String(row.concept_id), vector(row.embedding)]),
  );
  const topicVectors = concepts.flatMap((concept): ExistingTopicVector[] => {
    const embedding = embeddingByConcept.get(String(concept.id)) ?? [];
    return embedding.length
      ? [{
          conceptId: String(concept.id),
          domain: String(concept.domain ?? "General"),
          embedding,
        }]
      : [];
  });
  const termsBySegment = new Map<string, DbRow[]>();
  for (const row of input.terms) {
    const segmentId = String(row.segment_id);
    const group = termsBySegment.get(segmentId) ?? [];
    group.push(row);
    termsBySegment.set(segmentId, group);
  }
  const directAssignments: Array<{
    node: TopicGraphNode;
    segment: DbRow;
    domain: string;
    terms: SegmentTopicTerm[];
    decision: Exclude<SegmentTopicAssignmentDecision, { action: "unassigned" }>;
  }> = [];
  const discoveryNodes: TopicGraphNode[] = [];
  let belowAssignmentThreshold = 0;
  for (const node of input.nodes) {
    const segment = input.segmentById.get(node.id) ?? {};
    const terms = segmentTerms(termsBySegment.get(node.id) ?? []);
    const domain = inferSegmentDomain(segment, terms);
    const decision = decideSegmentTopicAssignment({
      terms,
      exactAliases,
      segmentDomain: domain,
      segmentEmbedding: node.embedding,
      concepts: topicVectors,
    });
    if (decision.action === "unassigned") {
      belowAssignmentThreshold += decision.similarity > 0 ? 1 : 0;
      discoveryNodes.push(node);
      continue;
    }
    directAssignments.push({ node, segment, domain, terms, decision });
  }
  const directlyLinkedSegments = await linkDirectSegmentAssignments(
    admin,
    ownerId,
    directAssignments,
  );
  const graph = buildNearestNeighbourGraph(discoveryNodes, {
    similarity: options.graphSimilarity,
    neighbours: options.neighbours,
  });
  const components = qualifyingTopicComponents(graph.components)
    .slice(0, maxCandidates);
  const componentBySegment = new Map(
    components.flatMap((component) => component.nodes.map((node) => [node.id, component.id] as const)),
  );
  const termEvidence: TopicTermEvidence[] = input.terms.flatMap((row) => {
    const componentId = componentBySegment.get(String(row.segment_id));
    if (!componentId) return [];
    const kind = String(row.term_kind) as TopicTermEvidence["kind"];
    return [{
      componentId,
      normalizedTerm: String(row.normalized_term),
      displayTerm: String(row.display_term),
      kind,
      count: Math.min(5, Math.max(1, Number(row.occurrence_count ?? 1))),
      titleCount: Math.max(0, Number(row.title_count ?? 0)),
      salience: Math.max(0, Math.min(1, Number(row.salience ?? 0))),
    }];
  });
  const representatives = classBasedTfidf(termEvidence);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const client = apiKey ? new OpenAI({ apiKey }) : null;
  const created: string[] = [];
  const autoMerged: string[] = [];
  const suggested: Array<{ label: string; conceptId: string; similarity: number }> = [];
  const namingErrors: string[] = [];
  let linkedSegments = directlyLinkedSegments;

  for (const component of components) {
    const phrases = representatives.get(component.id) ?? [];
    if (!phrases.length) continue;
    const naming = await nameTopic(client, component, phrases, input.segmentById);
    if (naming.error) namingErrors.push(naming.error);
    const topicName = naming.value;
    const normalizedLabel = normalizeConceptKey(topicName.label) ||
      normalizeConceptKey(phrases[0]?.displayTerm ?? "");
    if (!normalizedLabel) continue;
    const domain = topicName.domain || domainFor(topicName.label);
    const centroid = meanEmbedding(component.nodes.map((node) => node.embedding));
    let nearest: { conceptId: string; similarity: number } | null = null;
    for (const concept of concepts) {
      if (domainKey(concept.domain) !== domainKey(domain)) continue;
      const conceptEmbedding = embeddingByConcept.get(String(concept.id));
      if (!conceptEmbedding?.length || !centroid.length) continue;
      const similarity = cosineSimilarity(centroid, conceptEmbedding);
      if (!nearest || similarity > nearest.similarity) {
        nearest = { conceptId: String(concept.id), similarity };
      }
    }
    const decision = decideTopicAssignment({ normalizedLabel, exactAliases, nearest });
    let conceptId: string;
    let assignmentConfidence: number;
    if (decision.action === "exact_alias" || decision.action === "auto_merge") {
      conceptId = decision.conceptId;
      assignmentConfidence = decision.action === "exact_alias" ? 0.98 : decision.similarity;
      await writeAliases(
        admin,
        ownerId,
        conceptId,
        [topicName.label, ...topicName.aliases, ...phrases.slice(0, 6).map((phrase) => phrase.displayTerm)],
        decision.action === "exact_alias" ? "rule" : "model",
        assignmentConfidence,
      );
      autoMerged.push(topicName.label);
    } else {
      const fingerprint = sha256Hex(component.id);
      const existingComponent = concepts.find((concept) =>
        String(nested(concept.metadata).component_fingerprint ?? "") === fingerprint
      );
      const metadata = {
        component_fingerprint: fingerprint,
        support_items: component.nodes.length,
        source_families: component.sourceFamilies.length,
        representative_phrases: phrases.slice(0, 12),
        graph_similarity: options.graphSimilarity ?? TOPIC_GRAPH_SIMILARITY,
        graph_edges: component.edges.length,
        naming_method: naming.method,
        suggested_concept_id: decision.conceptId,
        suggested_similarity: decision.similarity,
        approval_required: decision.action === "candidate_with_suggestion",
      };
      const payload = {
        owner_id: ownerId,
        concept_type: "theme",
        canonical_label: topicName.label,
        normalized_key: normalizedLabel,
        domain,
        subdomain: topicName.subdomain,
        description: topicName.description,
        taxonomy_version: INTELLIGENCE_TOPIC_MAINTENANCE_VERSION,
        status: "candidate",
        metadata,
        updated_at: new Date().toISOString(),
      };
      const concept = existingComponent
        ? await admin.from("intelligence_concepts").update(payload)
          .eq("owner_id", ownerId).eq("id", existingComponent.id).select("id").single()
        : await admin.from("intelligence_concepts").upsert(payload, {
          onConflict: "owner_id,concept_type,normalized_key",
        }).select("id").single();
      if (concept.error || !concept.data?.id) {
        throw new Error(concept.error?.message ?? "Failed to create stable topic candidate.");
      }
      conceptId = String(concept.data.id);
      if (!concepts.some((candidate) => String(candidate.id) === conceptId)) {
        concepts.push({ id: conceptId, ...payload });
      }
      assignmentConfidence = decision.action === "candidate_with_suggestion" ? 0.72 : 0.68;
      created.push(topicName.label);
      exactAliases.set(normalizedLabel, conceptId);
      await writeAliases(
        admin,
        ownerId,
        conceptId,
        [topicName.label, ...topicName.aliases, ...phrases.slice(0, 8).map((phrase) => phrase.displayTerm)],
        "model",
        assignmentConfidence,
      );
      if (decision.action === "candidate_with_suggestion") {
        suggested.push({
          label: topicName.label,
          conceptId: decision.conceptId,
          similarity: decision.similarity,
        });
      }
      if (centroid.length) {
        const write = await admin.from("intelligence_concept_embeddings").upsert({
          owner_id: ownerId,
          concept_id: conceptId,
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
          embedding: vectorLiteral(centroid),
          taxonomy_version: INTELLIGENCE_TOPIC_MAINTENANCE_VERSION,
          updated_at: new Date().toISOString(),
        }, { onConflict: "concept_id,embedding_model,taxonomy_version" });
        if (write.error) throw new Error(write.error.message);
        embeddingByConcept.set(conceptId, centroid);
      }
    }
    linkedSegments += await linkComponentSegments(
      admin,
      ownerId,
      conceptId,
      component,
      input.segmentById,
      phrases,
      assignmentConfidence,
    );
  }

  const hasMore = input.hasMore;
  return {
    version: INTELLIGENCE_TOPIC_MAINTENANCE_VERSION,
    considered: components.length,
    scannedSegments: input.scanned,
    unassignedSegments: input.nodes.length,
    exactAssignments: directAssignments.filter(({ decision }) =>
      decision.action === "exact_alias").length,
    semanticAssignments: directAssignments.filter(({ decision }) =>
      decision.action === "semantic").length,
    candidateGraphSegments: discoveryNodes.length,
    belowAssignmentThreshold,
    graphEdges: graph.edges.length,
    connectedComponents: graph.components.length,
    qualifyingComponents: components.length,
    linkedSegments,
    createdCandidates: created,
    autoMergedAliases: autoMerged,
    reviewSuggestions: suggested,
    namingErrors: namingErrors.slice(0, 5),
    embeddingEnabled: Boolean(client),
    cursor,
    hasMore,
    nextCursor: hasMore ? cursor + input.scanned : null,
  };
}
