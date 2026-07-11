import { config } from "dotenv";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { processIntelligenceDocument } from "../src/lib/intelligence/pipeline";
import {
  INTELLIGENCE_SOURCE_TYPES,
  type IntelligenceDocumentEnvelope,
  type IntelligenceSourceType,
} from "../src/lib/intelligence/types";
import { normalizeSourceUrl } from "../src/lib/intelligence/source-url";

type UniversalInput = {
  source_type: IntelligenceSourceType;
  external_id?: string;
  url: string;
  canonical_url?: string | null;
  title?: string | null;
  author?: string | null;
  publisher?: string | null;
  published_at?: string | null;
  content?: string;
  transcript?: string;
  summary?: string | null;
  language?: string | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
};

async function readInput() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const values: UniversalInput[] = [];
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as UniversalInput | UniversalInput[];
    values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return values;
}

function externalId(row: UniversalInput) {
  return row.external_id?.trim() || createHash("sha256").update(row.url).digest("hex");
}

function validate(row: UniversalInput) {
  if (!INTELLIGENCE_SOURCE_TYPES.includes(row.source_type)) {
    throw new Error(`Unsupported source_type: ${String(row.source_type)}`);
  }
  const url = normalizeSourceUrl(row.url);
  if (!url) throw new Error("Each record requires a valid HTTP(S) url.");
  const content = row.transcript?.trim() || row.content?.trim();
  if (!content) throw new Error("Each record requires content or transcript text.");
  return { url, content };
}

async function main() {
  const ownerId = process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Configure INTELLIGENCE_OWNER_ID.");
  const input = await readInput();
  const admin = createAdminClient();
  const result = { received: input.length, processed: 0, failed: 0, events: 0, concepts: 0 };
  for (const row of input) {
    try {
      const { url, content } = validate(row);
      const envelope: IntelligenceDocumentEnvelope = {
        ownerId,
        sourceType: row.source_type,
        externalId: externalId(row),
        originalUrl: url,
        canonicalUrl: normalizeSourceUrl(row.canonical_url) ?? url,
        title: row.title ?? null,
        authorName: row.author ?? null,
        publisherName: row.publisher ?? null,
        language: row.language ?? "en",
        publishedAt: row.published_at ?? null,
        contentText: content,
        summaryShort: row.summary ?? null,
        sourceChannel: `universal_${row.source_type}`,
        labels: row.labels ?? [],
        metadata: {
          ...(row.metadata ?? {}),
          transcript_supplied: Boolean(row.transcript?.trim()),
          connector: "universal-jsonl-v1",
        },
      };
      const persisted = await processIntelligenceDocument(admin, envelope, {
        openaiApiKey: process.env.OPENAI_API_KEY,
      });
      result.processed += 1;
      result.events += persisted.eventCount;
      result.concepts += persisted.conceptCount;
    } catch (error) {
      result.failed += 1;
      console.error(error instanceof Error ? error.message : error);
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
