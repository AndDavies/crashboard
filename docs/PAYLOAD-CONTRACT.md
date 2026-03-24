# PAYLOAD-CONTRACT.md — Leroy Structured Ingestion Contract

## Purpose

This file defines what Leroy must do whenever Andrew sends a message in the **Baggo Topics** Telegram chat that is intended for the Personal Knowledgebase.

The goal is simple:
- Baggo receives the Telegram message
- Leroy handles the ingestion work
- Leroy extracts the **actual content**, not just the URL
- Leroy emits structured payloads suitable for repository storage

This contract lives on the **OpenClaw / Leroy side**, not in the Crashboard codebase.

---

## Core rule

When Andrew sends a Baggo Topics message containing one or more URLs for saving into the Personal Knowledgebase, Leroy should treat that as a content-ingestion job.

Leroy must perform:
- source detection
- fetching
- extraction
- normalization
- fanout
- lightweight enrichment
- summary generation
- keyword/tag generation
- hashtag extraction from the original Telegram message

The important unit of value is the **content**.

---

## Trigger condition

Leroy should be used when all or most of the following are true:
- the message arrives from **Baggo Topics** on Telegram
- the message includes one or more URLs
- the intent is to save, ingest, capture, or remember the content

Typical user intent examples:
- "save this"
- dropping a URL in the Baggo Topics chat/topic
- asking Baggo to save, ingest, or keep a link for later

---

## Input contract

Each Leroy ingestion task should be treated as having this logical input shape:

```ts
{
  urls: string[],
  telegram?: {
    chat_id: string | number,
    message_id: string | number,
    thread_id?: string | number | null,
    sender_id?: string | number | null,
    sender_label?: string | null,
    raw_text?: string | null,
    hashtags?: string[] | null,
    topic_id?: string | number | null,
    group_title?: string | null
  },
  openclaw?: {
    agent?: string | null,
    orchestrator?: string | null,
    channel?: string | null,
    session_id?: string | null,
    event_id?: string | null
  },
  metadata?: Record<string, unknown>
}
```

If some fields are unavailable, Leroy should still do the best possible job with the fields present.

---

## Required behavior for every message

For each distinct URL in the message, Leroy should:

1. classify the source type
2. fetch the relevant content locally
3. extract the meaningful content
4. normalize the extracted output
5. compute or attach useful metadata
6. generate a short summary/snapshot
7. generate lightweight keywords/tags
8. preserve Telegram hashtags as user tags
9. emit a structured payload for Crashboard
10. if additional important URLs are discovered, create fanout tasks or related payload hints

Do not merely forward the original URL unless extraction genuinely cannot proceed.

---

## Source detection rules

Leroy should classify each URL into one of:
- `article`
- `pdf`
- `youtube_video`
- `x_post`
- `document`
- `unknown`

### PDF detection
Treat as PDF if:
- URL path ends with `.pdf`, or
- fetched content type is `application/pdf`

### YouTube detection
Treat as YouTube if host matches:
- `youtube.com`
- `www.youtube.com`
- `m.youtube.com`
- `youtu.be`

### X/Twitter detection
Treat as X/Twitter if host matches:
- `x.com`
- `www.x.com`
- `twitter.com`
- `www.twitter.com`

### Generic article detection
Default to `article` for normal web pages that are not otherwise classified.

---

## Extraction rules by source type

## 1. Article / generic web page

Leroy should:
- fetch the page
- extract readable article/body text
- capture title
- capture canonical URL when available
- capture author when available
- capture publisher/site name when available
- capture language when available
- capture published date when confidently available
- normalize body text for storage/search
- generate a short summary
- generate a few useful keywords/tags

Output target:
- `document.source_type = "article"`

---

## 2. PDF

Leroy should:
- fetch the PDF
- extract document text locally
- derive title from metadata or filename when possible
- preserve original/canonical URL
- include byte size/checksum if practical
- normalize text for storage/search
- generate a short summary
- generate a few useful keywords/tags

Output target:
- `document.source_type = "pdf"`

---

## 3. YouTube

Leroy should:
- detect the video ID
- fetch title and channel metadata when available
- fetch transcript when available
- normalize transcript text
- preserve original URL and canonical watch URL when possible
- generate a short summary
- generate a few useful keywords/tags

Output target:
- `document.source_type = "youtube_video"`
- include transcript in `document.transcript_text`

Suggested metadata:
- `video_id`
- `channel_name`
- `duration_seconds` when available
- `transcript_source`
- `transcript_language`

If transcript is unavailable:
- do not silently succeed with empty content
- return a failure or partial-success outcome with clear warning metadata

---

## 4. X/Twitter post

Leroy should:
- fetch the visible content of the seed post
- preserve the seed URL
- capture author/handle when available
- detect outbound article URLs in the post
- normalize the post text cleanly for storage/search
- generate a short summary
- generate a few useful keywords/tags

### Current policy
For the core workflow, X support means single-post extraction only.
Do not make full thread expansion a requirement for successful X ingestion.

Suggested metadata:
- `platform = "x"`
- `author_handle`
- `author_name`
- `seed_post_url`
- `thread_expanded = false`
- `extraction_mode = "public_non_api"` when using the non-API path

---

## Fanout rules

If Leroy discovers additional important URLs during extraction, he should treat them as fanout candidates.

### Main example
If an X/Twitter post links to an article:
- produce a structured payload for the X content itself
- include the linked article URL in `related_urls`
- record fanout metadata
- linked articles should be eligible for separate ingestion work

Do **not** merge full linked-article body text into the X payload.
Treat it as a separate document.

Suggested fanout task shape:

```ts
{
  url: string,
  discovered_from: string,
  relation: "linked_article",
  provenance?: { ... }
}
```

---

## Lightweight enrichment rules

Leroy may include lightweight enrichment that helps later retrieval.

Allowed examples:
- outbound URLs
- short summaries/snapshots
- simple keywords/tags
- source-quality flags
- transcript completeness indicators
- topic/entity hints

Do not build:
- heavy entity resolution
- ontology/graph logic
- chunking
- embeddings

---

## Normalization rules

Apply these rules consistently:

1. preserve `original_url`
2. derive `canonical_url` when reasonably possible
3. clean title text
4. collapse repeated whitespace in normalized text
5. strip control characters when practical
6. avoid sending large irrelevant HTML blobs unless explicitly useful
7. compute `content_hash` from normalized text when practical
8. keep enough metadata for debugging and audit
9. preserve user hashtags separately from Leroy-generated keywords

---

## Canonical structured payload shape

Leroy should emit payloads in this shape for Crashboard:

```ts
{
  kind: "structured",

  document: {
    source_type: "article" | "pdf" | "youtube_video" | "x_post" | "document" | "unknown",
    original_url: string,
    canonical_url?: string | null,
    external_id?: string | null,
    title?: string | null,
    author_name?: string | null,
    publisher_name?: string | null,
    language?: string | null,
    published_at?: string | null,
    content_text?: string | null,
    content_markdown?: string | null,
    transcript_text?: string | null,
    summary_short?: string | null,
    content_hash?: string | null,
    canonical_key?: string | null,
    review_status?: "inbox" | "reviewed" | "archived" | "failed",
    ingestion_status?: "pending" | "ready" | "partial" | "failed",
    extraction_method: string,
    extraction_version?: string,
    metadata?: Record<string, unknown>,
    quality_flags?: Record<string, unknown>
  },

  capture?: {
    capture_source?: string,
    chat_id?: string | number,
    message_id?: string | number,
    thread_id?: string | number | null,
    sender_id?: string | number | null,
    sender_label?: string | null,
    raw_text?: string | null,
    metadata?: Record<string, unknown>
  },

  tags?: {
    user_tags?: string[],
    leroy_tags?: Array<{
      tag: string,
      confidence?: number | null,
      type?: string | null
    }>
  },

  related_urls?: string[],

  fanout?: {
    parent_url?: string | null,
    relation?: string | null,
    discovered_from?: string | null
  }
}
```

---

## Success, partial success, and failure rules

### Success
Use when meaningful content was extracted and normalized.

### Partial success
Use when:
- metadata was extracted but text is weak
- transcript is incomplete
- extraction succeeded with warnings

Partial success should include:
- quality flags
- warnings in metadata
- enough context to understand the limitation

### Failure
Use when:
- URL is unsupported
- fetch failed
- extraction failed
- transcript unavailable and no useful content was produced

Do not silently succeed with empty content.

---

## Operating note

This file defines what Leroy should do **every time Andrew sends a Baggo Topics message for ingestion**.

It is the durable contract for Leroy’s producer-side behavior.
The target storage model for this contract is defined in:
- `projects/personal-knowledgebase/SCHEMA.md`
