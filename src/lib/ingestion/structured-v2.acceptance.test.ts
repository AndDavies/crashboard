import { describe, expect, it } from "vitest";
import { parseStructuredIngestionBody } from "@/lib/ingestion/structured-schema";
import { extractUrlHost, normalizeUserTagLabel } from "@/lib/ingestion/document-helpers";

describe("v2 structured payload acceptance (parse)", () => {
  it("Test 1 — article with hashtags, Telegram capture, Leroy tags, summary", () => {
    const raw = {
      kind: "structured" as const,
      document: {
        source_type: "article" as const,
        original_url: "https://www.example.com/policy/ai-bill",
        canonical_url: "https://www.example.com/policy/ai-bill",
        title: "AI Policy Brief",
        author_name: "Jane Doe",
        publisher_name: "Example Times",
        language: "en",
        published_at: "2025-01-15T12:00:00.000Z",
        content_text: "Article body about AI policy goes here.",
        summary_short: "Snapshot: pending regulation themes.",
        extraction_method: "leroy/article-v1",
        extraction_version: "2",
        metadata: { section: "policy" },
        quality_flags: {},
      },
      capture: {
        capture_source: "telegram" as const,
        chat_id: -1001234567890,
        message_id: 42,
        thread_id: 7,
        sender_id: 99,
        sender_label: "Andrew",
        raw_text: "save this https://www.example.com/policy/ai-bill #ai #policy",
        metadata: { intake: "baggo-topics" },
      },
      tags: {
        user_tags: ["#ai", "#policy"],
        leroy_tags: [{ tag: "Regulation", confidence: 0.9, type: "topic" }],
      },
    };
    const parsed = parseStructuredIngestionBody(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.document.summary_short).toContain("Snapshot");
    expect(parsed.value.document.source_type).toBe("article");
    expect(extractUrlHost(parsed.value.document.original_url!)).toBe("www.example.com");
    expect(normalizeUserTagLabel("#ai").tag_normalized).toBe("ai");
    expect(normalizeUserTagLabel("#policy").tag_normalized).toBe("policy");
    expect(parsed.value.tags?.user_tags).toHaveLength(2);
    expect(parsed.value.tags?.leroy_tags?.[0]?.tag).toBe("Regulation");
    expect(parsed.value.capture?.capture_source).toBe("telegram");
  });

  it("Test 2 — PDF with extracted text, summary, Telegram capture", () => {
    const raw = {
      kind: "structured" as const,
      document: {
        source_type: "pdf" as const,
        original_url: "https://cdn.example.com/reports/q4.pdf",
        title: "Q4 Report",
        content_text: "Full extracted PDF text here.",
        summary_short: "Quarterly highlights.",
        extraction_method: "leroy/pdf-v1",
        metadata: { page_count: 12 },
      },
      capture: {
        capture_source: "telegram" as const,
        chat_id: "100",
        message_id: "200",
        raw_text: "PDF link",
      },
    };
    const parsed = parseStructuredIngestionBody(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.document.source_type).toBe("pdf");
    expect(parsed.value.document.content_text).toContain("extracted");
    expect(parsed.value.capture?.chat_id).toBe("100");
  });

  it("Test 3 — YouTube transcript, external_id, summary, tags", () => {
    const raw = {
      kind: "structured" as const,
      document: {
        source_type: "youtube_video" as const,
        original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        external_id: "dQw4w9WgXcQ",
        title: "Example video",
        transcript_text: "[0:00] Speaker: Hello world transcript.",
        summary_short: "Short talk intro.",
        extraction_method: "leroy/youtube-v1",
        ingestion_status: "ready" as const,
        review_status: "inbox" as const,
      },
      capture: { capture_source: "api" as const },
      tags: {
        leroy_tags: [{ tag: "video", type: "topic" }],
      },
    };
    const parsed = parseStructuredIngestionBody(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.document.transcript_text).toContain("transcript");
    expect(parsed.value.document.external_id).toBe("dQw4w9WgXcQ");
    expect(parsed.value.tags?.leroy_tags).toHaveLength(1);
  });

  it("Test 4 — X post with linked article fanout and related_urls", () => {
    const raw = {
      kind: "structured" as const,
      document: {
        source_type: "x_post" as const,
        original_url: "https://x.com/user/status/1234567890",
        content_text: "Check this piece https://news.example.com/story",
        summary_short: "Post points to article.",
        extraction_method: "leroy/x-v1",
        metadata: { platform: "x" },
      },
      capture: { capture_source: "telegram" as const, chat_id: 1, message_id: 2 },
      related_urls: ["https://news.example.com/story"],
      fanout: {
        parent_url: "https://x.com/user/status/1234567890",
        relation: "linked_article",
        discovered_from: "https://x.com/user/status/1234567890",
      },
    };
    const parsed = parseStructuredIngestionBody(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.document.source_type).toBe("x_post");
    expect(parsed.value.related_urls).toEqual(["https://news.example.com/story"]);
    expect(parsed.value.fanout?.relation).toBe("linked_article");
  });
});

describe("invalid payload", () => {
  it("rejects empty body fields", () => {
    const raw = {
      kind: "structured" as const,
      document: {
        source_type: "article" as const,
        original_url: "https://a.com",
        extraction_method: "t",
      },
    };
    const parsed = parseStructuredIngestionBody(raw);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.details.length).toBeGreaterThan(0);
    expect(parsed.message.toLowerCase()).toMatch(/content_text|summary|transcript|markdown/i);
  });
});
