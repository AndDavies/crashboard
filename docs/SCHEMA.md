# SCHEMA.md — Personal Knowledgebase v2

## Decision

The previous backend schema should be discarded rather than preserved or integrated.

This project is early enough that the right move is a clean restart around a simpler, content-first model.

## Product architecture

The system has two related but distinct layers:

1. **Repository**
   - capture links quickly from Telegram Topics
   - extract and store the underlying content
   - preserve provenance
   - support browse, filter, keyword search, and review

2. **Knowledgebase**
   - chunk stored content
   - generate embeddings
   - support semantic retrieval and ask-style workflows

The repository comes first. The knowledgebase is built on top of it.

## Core design principle

The main unit of value is:

> a saved item with extracted content, metadata, provenance, and lightweight review/enrichment

That unit should be represented as a single primary record.

Avoid splitting the core record across too many ingestion-specific tables.

## v2 schema overview

### 1. `documents`

Primary system-of-record table.
Each row is one canonical saved source.

Suggested fields:
- `id`
- `source_type` — article, pdf, youtube_video, x_post, document, unknown
- `original_url`
- `canonical_url`
- `url_host`
- `external_id` — youtube id, x post id, etc.
- `title`
- `author_name`
- `publisher_name`
- `language`
- `published_at`
- `content_text` — normalized primary searchable text
- `content_markdown` — optional readable rendering
- `transcript_text` — when relevant
- `summary_short` — Leroy-generated snapshot
- `summary_medium` — optional richer summary later
- `review_status` — inbox, reviewed, archived, failed
- `ingestion_status` — pending, ready, partial, failed
- `extraction_method`
- `extraction_version`
- `content_hash`
- `canonical_key` — normalized dedupe key
- `metadata` jsonb
- `quality_flags` jsonb
- `captured_at`
- `created_at`
- `updated_at`

### 2. `document_captures`

Stores capture/provenance events.
A document may be captured more than once.

Suggested fields:
- `id`
- `document_id`
- `capture_source` — telegram, import, manual, api
- `chat_id`
- `message_id`
- `thread_id`
- `sender_id`
- `sender_label`
- `raw_text`
- `captured_at`
- `metadata` jsonb

### 3. `tags`

Normalized tag catalog.
Supports user hashtags and system-generated keywords.

Suggested fields:
- `id`
- `tag`
- `tag_normalized`
- `tag_type` — user_hashtag, leroy_keyword, topic, project, entity_hint
- `created_at`

### 4. `document_tags`

Join table between documents and tags.

Suggested fields:
- `document_id`
- `tag_id`
- `source` — telegram_hashtag, leroy, manual
- `confidence` — nullable
- `metadata` jsonb
- `created_at`

### 5. `document_links`

Minimal related-item table for fanout and relationships.

Suggested fields:
- `id`
- `from_document_id`
- `to_document_id`
- `relation` — linked_article, duplicate_of, canonical_of, mentioned_in
- `url`
- `metadata` jsonb

## Phase 2 tables

### 6. `document_chunks`

Chunked text for retrieval.

Suggested fields:
- `id`
- `document_id`
- `chunk_index`
- `chunk_text`
- `token_count`
- `char_count`
- `metadata` jsonb
- `created_at`

### 7. `document_embeddings`

Vector storage kept separate from the repository tables.

Suggested fields:
- `chunk_id`
- `model`
- `embedding`
- `created_at`

## Required ingestion behavior

For each URL Leroy should:
- classify the source
- fetch and extract useful content
- normalize a canonical document record
- generate a short summary/snapshot
- extract lightweight keywords/tags
- attach Telegram hashtags from the original message as user tags
- preserve provenance in `document_captures`
- create related-item rows when fanout happens

## Tagging model

### User tags

Andrew can add hashtags directly in the Telegram Topics message.
Those hashtags should be parsed and stored as tags linked to the document with:
- `tag_type = user_hashtag`
- `source = telegram_hashtag`

### Leroy tags

Leroy may add lightweight search-aiding tags/keywords based on the extracted content.
These should be helpful and pragmatic, not ontology-heavy.

Examples:
- topic tags
- company/person/concept hints
- content bucket tags
- format hints

These should be stored with:
- `tag_type = leroy_keyword` or related subtype
- `source = leroy`

## Dedupe model

Dedupe should be based on a simple canonical key.

Priority:
1. stable external id (`youtube:<id>`, `x:<id>`)
2. normalized canonical URL
3. normalized original URL

Repeated saves of the same item should create additional `document_captures` rows, not duplicate `documents` rows.

## Search model

### Repository UI
Use standard Postgres keyword/full-text search first.
Primary searchable inputs:
- title
- content_text
- transcript_text
- summary_short
- tags

### Knowledgebase UI
Use chunk embeddings later for semantic retrieval.

## Portability rule

The schema must stay easy to export and move.
That means:
- store plain text plainly
- keep vectors separate
- keep provenance readable
- avoid coupling the model to a specific pipeline implementation

## Anti-goals

Do not rebuild around:
- heavy ingestion job orchestration tables unless operationally required
- a large source/source_contents split unless content versioning becomes necessary
- entity graph infrastructure
- speculative ontology work
- generalized multi-tenant abstractions
- preserving compatibility with the old schema

## Summary

The v2 backend should be:
- simpler
- content-first
- provenance-aware
- taggable
- searchable
- portable
- ready for chunking/embeddings later
