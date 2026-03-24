import { describe, expect, it, vi } from "vitest";
import { persistStructuredDocumentV2 } from "@/lib/ingestion/document-persistence";
import type { StructuredIngestionBody } from "@/lib/ingestion/structured-schema";

const DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockAdmin() {
  const from = vi.fn((table: string) => {
    if (table === "tags") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: vi.fn(async () => ({
              data: { id: TAG_ID },
              error: null,
            })),
          }),
        }),
      };
    }
    if (table === "documents") {
      return {
        insert: () => ({
          select: () => ({
            single: vi.fn(async () => ({
              data: { id: DOC_ID },
              error: null,
            })),
          }),
        }),
      };
    }
    return {
      insert: vi.fn(async () => ({ error: null })),
    };
  });
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("persistStructuredDocumentV2", () => {
  it("writes document, capture, tags, and links (mocked)", async () => {
    const body = {
      kind: "structured" as const,
      document: {
        source_type: "x_post" as const,
        original_url: "https://x.com/u/status/1",
        content_text: "post",
        summary_short: "s",
        extraction_method: "leroy/x",
      },
      capture: { capture_source: "telegram" as const, chat_id: 1, message_id: 2 },
      tags: {
        user_tags: ["#x"],
        leroy_tags: [{ tag: "news", type: "topic" }],
      },
      related_urls: ["https://article.example/a"],
      fanout: {
        relation: "linked_article",
        parent_url: "https://x.com/u/status/1",
      },
    } satisfies StructuredIngestionBody;

    const admin = mockAdmin();
    const result = await persistStructuredDocumentV2(admin, body);
    expect(result.documentId).toBe(DOC_ID);
    expect(result.counts.captures).toBe(1);
    expect(result.counts.documentTagsCreated).toBe(2);
    expect(result.counts.linksCreated).toBe(1);
    expect(result.counts.tagRowsCreated).toBeGreaterThanOrEqual(1);
    expect(admin.from).toHaveBeenCalledWith("documents");
    expect(admin.from).toHaveBeenCalledWith("document_captures");
    expect(admin.from).toHaveBeenCalledWith("document_links");
  });
});
