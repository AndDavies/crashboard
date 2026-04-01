#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";

type DocumentRow = {
  id: string;
  created_at: string;
  title: string | null;
  summary_medium: string | null;
  summary_short: string | null;
  content_text: string | null;
  content_markdown: string | null;
  transcript_text: string | null;
};

type OpenAiTagResult = { tags: string[]; confidence?: number };

const WORKDIR = process.cwd();
const ENV_PATH = path.join(WORKDIR, ".env.local");

const BATCH_SIZE = 25;
const MAX_CHARS = 4000;
const OPENAI_MODEL = "gpt-5-mini";
const ALLOWED_CLASSIFICATION_TAGS = new Set([
  "ai",
  "cybersecurity",
  "defence",
  "maritime",
  "regulation",
  "policy",
  "project-management",
  "data",
  "innovation",
  "fitness",
  "general",
  "health",
]);

const DELAY_MS = Number(process.env.BACKFILL_TAGS_DELAY_MS || "50");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDotEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function required(value: string | undefined, name: string): string {
  const v = value?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function pickText(doc: DocumentRow): string | null {
  return (
    doc.summary_medium?.trim() ||
    doc.summary_short?.trim() ||
    doc.content_text?.trim() ||
    doc.content_markdown?.trim() ||
    doc.transcript_text?.trim() ||
    doc.title?.trim() ||
    null
  );
}

function truncateClean(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  let cut = t.slice(0, maxChars);
  // Try avoid cutting mid-word: backtrack to last whitespace near the end.
  const tailWindow = 80;
  const start = Math.max(0, cut.length - tailWindow);
  const tail = cut.slice(start);
  const lastWs = Math.max(tail.lastIndexOf(" "), tail.lastIndexOf("\n"), tail.lastIndexOf("\t"));
  if (lastWs > 20) {
    cut = cut.slice(0, start + lastWs);
  }
  return cut.trim();
}

function normalizeTag(raw: string): { tag: string; tag_normalized: string } | null {
  const base = raw.trim().toLowerCase();
  if (!base) return null;
  const tag_normalized = base.replace(/\s+/gu, "-");
  return { tag: base, tag_normalized };
}

function coerceConfidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.7;
  if (v < 0 || v > 1) return 0.7;
  return v;
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OpenAI response did not contain a JSON object.");
  }
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

async function openAiExtractTags(
  client: OpenAI,
  text: string,
  retries = 2,
): Promise<OpenAiTagResult> {
  const prompt = `Classify the following content into 1 or 2 HIGH-LEVEL categories.

You MUST choose from this list ONLY:

- ai
- cybersecurity
- defence
- maritime
- regulation
- policy
- project-management
- data
- innovation
- fitness
- general
- health

Rules:
- Return ONLY 1 or 2 tags
- Do NOT create new tags
- Do NOT use specific terms
- Choose the most relevant broad categories

Return JSON only:
{
  "tags": ["tag1", "tag2"],
  "confidence": 0-1
}

Content:
${text}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const resp = await client.responses.create({
        model: OPENAI_MODEL,
        input: prompt,
      });
      const outText = (resp as unknown as { output_text?: string }).output_text;
      if (!outText) {
        throw new Error("OpenAI response missing output_text.");
      }
      const parsed = extractJsonObject(outText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("OpenAI JSON was not an object.");
      }
      const o = parsed as Record<string, unknown>;
      const tags = Array.isArray(o.tags)
        ? o.tags.filter((t): t is string => typeof t === "string")
        : [];
      const confidence = coerceConfidence(o.confidence);
      return { tags, confidence };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("OpenAI call failed.");
}

function isPgUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string };
  return o.code === "23505" || (o.message?.includes("duplicate key") ?? false);
}

function looksLikeCheckViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string };
  return o.code === "23514" || (o.message?.toLowerCase().includes("check constraint") ?? false);
}

async function fetchUntaggedDocuments(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("documents")
    .select(
      "id, created_at, title, summary_medium, summary_short, content_text, content_markdown, transcript_text",
    )
    .eq("ingestion_status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentRow[];
}

async function getOrCreateTagId(
  admin: ReturnType<typeof createAdminClient>,
  tag: { tag: string; tag_normalized: string },
  tagType: string,
): Promise<string> {
  const existing = await admin
    .from("tags")
    .select("id")
    .eq("tag_normalized", tag.tag_normalized)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return existing.data.id as string;

  const inserted = await admin
    .from("tags")
    .insert({
      tag: tag.tag,
      tag_normalized: tag.tag_normalized,
      tag_type: tagType,
    })
    .select("id")
    .single();

  if (!inserted.error && inserted.data?.id) return inserted.data.id as string;

  // Race-safe: if insert failed due to uniqueness, reselect; otherwise bubble up.
  if (isPgUniqueViolation(inserted.error)) {
    const again = await admin
      .from("tags")
      .select("id")
      .eq("tag_normalized", tag.tag_normalized)
      .maybeSingle();
    if (again.error) throw new Error(again.error.message);
    if (!again.data?.id) throw new Error("Tag insert failed and reselect found nothing.");
    return again.data.id as string;
  }

  throw new Error(inserted.error?.message ?? "Tag insert failed.");
}

async function insertDocumentTag(
  admin: ReturnType<typeof createAdminClient>,
  payload: {
    document_id: string;
    tag_id: string;
    source: string;
    confidence: number;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const ins = await admin.from("document_tags").insert(payload);
  if (!ins.error) return;
  if (isPgUniqueViolation(ins.error)) return; // idempotent
  throw new Error(ins.error.message);
}

async function markDocumentProcessed(
  admin: ReturnType<typeof createAdminClient>,
  documentId: string,
): Promise<void> {
  const upd = await admin
    .from("documents")
    .update({ ingestion_status: "ready" })
    .eq("id", documentId);
  if (upd.error) throw new Error(upd.error.message);
}

async function main() {
  const fileEnv = loadDotEnv(ENV_PATH);
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  const TAG_TYPE_PRIMARY = process.env.BACKFILL_TAG_TYPE || "auto";
  const TAG_TYPE_FALLBACK = process.env.BACKFILL_TAG_TYPE_FALLBACK || "";
  const DOC_TAG_SOURCE_PRIMARY =
    process.env.BACKFILL_DOCUMENT_TAG_SOURCE || "auto_backfill";
  const DOC_TAG_SOURCE_FALLBACK =
    process.env.BACKFILL_DOCUMENT_TAG_SOURCE_FALLBACK || "";

  const supabaseUrl = required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = required(process.env.OPENAI_API_KEY, "OPENAI_API_KEY");

  // Reuse existing admin client helper (expects NEXT_PUBLIC_SUPABASE_URL).
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;

  const admin = createAdminClient();
  const openai = new OpenAI({ apiKey: openAiKey });

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `[backfill-tags] starting. batch=${BATCH_SIZE} model=${OPENAI_MODEL} tag_type=${TAG_TYPE_PRIMARY} doc_tag_source=${DOC_TAG_SOURCE_PRIMARY}`,
  );

  // Loop until no more untagged documents remain.
  // Processes 25 at a time, per requirements.
  for (;;) {
    const docs = await fetchUntaggedDocuments(admin);
    if (!docs.length) break;

    for (const doc of docs) {
      try {
        const raw = pickText(doc);
        if (!raw) {
          skipped += 1;
          console.log(`[backfill-tags] skip ${doc.id} (no usable text)`);
          continue;
        }
        const text = truncateClean(raw, MAX_CHARS);
        if (!text) {
          skipped += 1;
          console.log(`[backfill-tags] skip ${doc.id} (empty after truncation)`);
          continue;
        }

        const llm = await openAiExtractTags(openai, text, 2);
        const tags = (llm.tags ?? [])
          .map(normalizeTag)
          .filter((t): t is NonNullable<ReturnType<typeof normalizeTag>> => Boolean(t));

        // De-dupe tag_normalized within the response.
        const seen = new Set<string>();
        const unique = tags.filter((t) => {
          if (seen.has(t.tag_normalized)) return false;
          seen.add(t.tag_normalized);
          return true;
        });
        const filteredAllowed = unique.filter((t) =>
          ALLOWED_CLASSIFICATION_TAGS.has(t.tag_normalized),
        );
        const allowed =
          filteredAllowed.length > 0
            ? filteredAllowed.slice(0, 2)
            : [{ tag: "general", tag_normalized: "general" }];

        console.log(
          `[backfill-tags] doc=${doc.id} tags=${allowed.map((t) => t.tag_normalized).join(", ")}`,
        );

        // Create tags + document_tags
        const confidence = coerceConfidence(llm.confidence);
        for (const t of allowed) {
          let tagId: string | null = null;
          try {
            tagId = await getOrCreateTagId(admin, t, TAG_TYPE_PRIMARY);
          } catch (e) {
            // If DB check constraint rejects requested tag_type, optionally retry with fallback.
            if (TAG_TYPE_FALLBACK && looksLikeCheckViolation(e)) {
              console.warn(
                `[backfill-tags] tag_type '${TAG_TYPE_PRIMARY}' rejected; retrying '${TAG_TYPE_FALLBACK}'`,
              );
              tagId = await getOrCreateTagId(admin, t, TAG_TYPE_FALLBACK);
            } else {
              throw e;
            }
          }

          const base = {
            document_id: doc.id,
            tag_id: tagId,
            source: DOC_TAG_SOURCE_PRIMARY,
            confidence,
            metadata: { model: OPENAI_MODEL, version: "v1" },
          };

          try {
            await insertDocumentTag(admin, base);
          } catch (e) {
            if (DOC_TAG_SOURCE_FALLBACK && looksLikeCheckViolation(e)) {
              console.warn(
                `[backfill-tags] document_tags.source '${DOC_TAG_SOURCE_PRIMARY}' rejected; retrying '${DOC_TAG_SOURCE_FALLBACK}'`,
              );
              await insertDocumentTag(admin, {
                ...base,
                source: DOC_TAG_SOURCE_FALLBACK,
              });
            } else {
              throw e;
            }
          }
        }

        await markDocumentProcessed(admin, doc.id);
        console.log(`[backfill-tags] completed ${doc.id}`);

        processed += 1;
        await sleep(DELAY_MS);
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[backfill-tags] fail ${doc.id}: ${msg}`);
        continue;
      }
    }
  }

  console.log(
    `[backfill-tags] done. processed=${processed} skipped=${skipped} failed=${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[backfill-tags] fatal: ${msg}`);
  process.exitCode = 1;
});

