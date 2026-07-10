import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

const mocks = vi.hoisted(() => ({
  createEmbedding: vi.fn(),
  extractIntelligence: vi.fn(),
  persistIntelligenceDocument: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {},
}));

vi.mock("@/lib/intelligence/enrichment", () => ({
  createEmbedding: mocks.createEmbedding,
  extractIntelligence: mocks.extractIntelligence,
  INTELLIGENCE_EXTRACTION_MODEL: "test-extraction-model",
  INTELLIGENCE_EXTRACTION_TIMEOUT_MS: 75_000,
  INTELLIGENCE_OPENAI_MAX_RETRIES: 0,
  shouldDeeplyEnrich: () => true,
}));

vi.mock("@/lib/intelligence/persistence", () => ({
  persistIntelligenceDocument: mocks.persistIntelligenceDocument,
}));

import { processIntelligenceDocument } from "@/lib/intelligence/pipeline";

const document: IntelligenceDocumentEnvelope = {
  ownerId: "00000000-0000-0000-0000-000000000001",
  sourceType: "email_newsletter",
  externalId: "message-1",
  originalUrl: "https://mail.google.com/message-1",
  title: "Procurement update",
  contentText: "Canada announced a defence procurement.",
};

describe("processIntelligenceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractIntelligence.mockResolvedValue({ events: [], entities: [] });
    mocks.persistIntelligenceDocument.mockResolvedValue({
      documentId: "document-1",
      deduped: false,
      embeddingPersisted: null,
      eventIds: [],
      entityIds: [],
    });
  });

  it("persists successful extraction when embedding generation fails", async () => {
    const embeddingError = new Error("embedding input too long");
    mocks.createEmbedding.mockRejectedValue(embeddingError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await processIntelligenceDocument({} as never, document, {
      openaiApiKey: "test-key",
    });

    expect(result.embeddingStatus).toBe("failed");
    expect(mocks.persistIntelligenceDocument).toHaveBeenCalledWith(
      expect.anything(),
      document,
      expect.objectContaining({
        extraction: { events: [], entities: [] },
        embedding: null,
        processingQualityFlags: ["embedding_failed"],
      }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[intelligence] Embedding failed; continuing without it.",
      expect.objectContaining({ externalId: "message-1" }),
    );
    consoleError.mockRestore();
  });

  it("still rejects the document when extraction fails", async () => {
    mocks.extractIntelligence.mockRejectedValue(new Error("extraction failed"));
    mocks.createEmbedding.mockResolvedValue([0.1, 0.2]);

    await expect(
      processIntelligenceDocument({} as never, document, {
        openaiApiKey: "test-key",
      }),
    ).rejects.toThrow("extraction failed");
    expect(mocks.persistIntelligenceDocument).not.toHaveBeenCalled();
  });
});
