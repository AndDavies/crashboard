import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  createEmbedding,
  createEmbeddings,
  groupEmbeddingRequestItems,
  INTELLIGENCE_EMBEDDING_CHUNK_BYTES,
  INTELLIGENCE_EMBEDDING_MAX_CHUNKS,
  INTELLIGENCE_EMBEDDING_REQUEST_MAX_BYTES,
  INTELLIGENCE_EMBEDDING_REQUEST_MAX_SEGMENTS,
  INTELLIGENCE_EMBEDDING_TIMEOUT_MS,
  INTELLIGENCE_OPENAI_MAX_RETRIES,
  prepareEmbeddingInputs,
  shouldDeeplyEnrich,
} from "@/lib/intelligence/enrichment";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

function document(contentText: string): IntelligenceDocumentEnvelope {
  return {
    ownerId: "00000000-0000-0000-0000-000000000001",
    sourceType: "email_newsletter",
    externalId: "message-1",
    originalUrl: "https://mail.google.com/message-1",
    title: "Daily update",
    contentText,
  };
}

describe("shouldDeeplyEnrich", () => {
  it("selects procurement, funding, and defence signals", () => {
    expect(
      shouldDeeplyEnrich(document("Canada issued an RFI for a new defence capability.")),
    ).toBe(true);
    expect(shouldDeeplyEnrich(document("The company announced a new funding round."))).toBe(
      true,
    );
  });

  it("does not send routine filler to deep extraction", () => {
    expect(shouldDeeplyEnrich(document("A short collection of productivity links."))).toBe(
      false,
    );
  });

  it("bounds every embedding input by UTF-8 bytes without splitting Unicode", () => {
    const content = `${"😀".repeat(3_000)} ${"é".repeat(2_000)} ${"a".repeat(9_000)}`;
    const chunks = prepareEmbeddingInputs(content);
    const encoder = new TextEncoder();

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(INTELLIGENCE_EMBEDDING_MAX_CHUNKS);
    expect(
      chunks.every(
        (chunk) => encoder.encode(chunk).byteLength <= INTELLIGENCE_EMBEDDING_CHUNK_BYTES,
      ),
    ).toBe(true);
    expect(chunks.join("")).toBe(content.replace(/\s+/g, " ").trim());
  });

  it("batches and combines long-document embeddings within the request budget", async () => {
    const create = vi.fn(async (request: { input: string[] }) => ({
      data: request.input.map((_, index) => ({
        index,
        embedding: index === 0 ? [1, 0] : [0, 1],
      })),
    }));
    const client = {
      embeddings: { create },
    } as unknown as OpenAI;

    const result = await createEmbedding("a".repeat(9_000), { client });
    const [request, requestOptions] = create.mock.calls[0] as unknown as [
      { input: string[] },
      { timeout: number; maxRetries: number },
    ];

    expect(request.input).toHaveLength(2);
    expect(requestOptions).toEqual({
      timeout: INTELLIGENCE_EMBEDDING_TIMEOUT_MS,
      maxRetries: INTELLIGENCE_OPENAI_MAX_RETRIES,
    });
    expect(INTELLIGENCE_OPENAI_MAX_RETRIES).toBe(0);
    expect(result[0]).toBeCloseTo(0.992278, 5);
    expect(result[1]).toBeCloseTo(0.124035, 5);
  });

  it("embeds several editorial segments in one request without mixing their vectors", async () => {
    const create = vi.fn(async () => ({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    }));
    const client = { embeddings: { create } } as unknown as OpenAI;

    const result = await createEmbeddings(["first segment", "second segment"], { client });

    expect(create).toHaveBeenCalledOnce();
    expect(result).toEqual([[1, 0], [0, 1]]);
  });

  it("groups up to twenty prepared segments in one embedding request", () => {
    const items = Array.from({ length: 21 }, (_, index) => ({
      id: index,
      content: `segment ${index}`,
    }));

    const groups = groupEmbeddingRequestItems(items, (item) => item.content);

    expect(INTELLIGENCE_EMBEDDING_REQUEST_MAX_SEGMENTS).toBe(20);
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      Array.from({ length: 20 }, (_, index) => index),
      [20],
    ]);
  });

  it("starts a new request before prepared text exceeds the byte ceiling", () => {
    const items = [
      { id: "one", content: "a".repeat(30_000) },
      { id: "two", content: "b".repeat(30_000) },
      { id: "three", content: "c".repeat(30_000) },
    ];

    const groups = groupEmbeddingRequestItems(items, (item) => item.content);

    expect(INTELLIGENCE_EMBEDDING_REQUEST_MAX_BYTES).toBe(80_000);
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ["one", "two"],
      ["three"],
    ]);
  });

  it("allows one oversized prepared segment alone so progress can continue", () => {
    const items = [
      { id: "oversized", content: "😀".repeat(22_000) },
      { id: "next", content: "small segment" },
    ];

    const groups = groupEmbeddingRequestItems(items, (item) => item.content);

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ["oversized"],
      ["next"],
    ]);
  });
});
