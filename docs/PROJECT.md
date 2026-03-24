# PROJECT.md — Personal Knowledgebase

## Overview

Personal Knowledgebase is Andrew's private knowledge repository and retrieval system.

It is centered on a simple user behavior:
- Andrew encounters useful content throughout the day
- he sends it to a Telegram topic
- Leroy extracts the actual content and lightweight review metadata
- the system stores it in Supabase/Postgres
- later, Andrew can browse, search, and query it from private dashboard views

## Goals

- Make content capture extremely low-friction
- Ensure saved material is properly extracted and normalized
- Support the highest-value source types first
- Add a lightweight review layer so stored items are easier to search later
- Build a useful private repository/dashboard view of saved material
- Enable semantic search and question-answering over saved material later
- Preserve enough provenance to trust what was captured and from where
- Keep the backend schema simple and portable

## Source support target

The intended source types are:
- article / generic web page
- PDF
- YouTube video with transcript
- X/Twitter post
- tweet-linked article fanout

Current X scope decision:
- support single-post extraction plus linked-article fanout
- do not require full X/Twitter thread expansion for the core workflow
- do not make paid X API access a dependency for useful ingestion

## Capture and enrichment intent

Andrew may add hashtags in Telegram Topics messages to indicate keywords, topics, or project labels.

The ingestion system should preserve two layers of enrichment:
- **user-provided tags** from Telegram hashtags
- **Leroy-generated enrichment** such as:
  - short summary/snapshot
  - lightweight keywords
  - useful topic/entity hints for search

This enrichment should improve repository search and later retrieval without becoming a heavy ontology or graph system.

## Dashboard intent

This will live as private page(s) within the Crashboard dashboard at Crashboard.dev.

The product should eventually include two related interfaces:

### 1. Repository UI
A corpus/library interface for:
- inbox/library view
- source detail view
- filters and keyword search
- readable extracted text/transcript
- metadata, provenance, tags, and related links

### 2. Knowledgebase UI
A query-oriented interface for:
- natural-language query / ask
- semantic retrieval over chunks
- evidence/citation display back to saved sources

## Technical direction

- System of record: Supabase / Postgres
- Current implementation home: Crashboard codebase
- Capture path: Telegram topic → OpenClaw helper/orchestrator → Leroy-style extraction → Crashboard ingestion endpoint
- Repository storage model: simple `documents`-first schema
- Retrieval model: chunking + embeddings + semantic search + lightweight reranking

## Schema direction

The old schema should not be preserved.
This project is early enough to restart with a clean, simpler backend model.

The new schema should be designed around:
- one canonical saved document/source row
- separate capture provenance rows
- tags from both Telegram hashtags and Leroy enrichment
- minimal related-item/fanout links
- later chunking and embedding tables

See:
- `projects/personal-knowledgebase/SCHEMA.md`

## Non-goals for the near term

- Building a multi-user SaaS product
- Overbuilding generalized ingestion infrastructure before retrieval works
- Heavy entity graph / ontology work
- UI polish before the core ingestion and retrieval loop is useful
- Preserving or integrating the current schema just for continuity
- Introducing SQLite into the Crashboard implementation

## Current status summary

### Proven working
- OpenClaw/Baggo Topics style URL save flow has worked end-to-end for at least one article URL
- Baggo replied `saved`
- Andrew verified that a row was inserted in the database
- Agent-side extraction paths now exist for article/web, PDF, YouTube transcript, and X single-post extraction

### Strategic reset now chosen
- the current database schema should be discarded
- the replacement should be simpler and document-first
- repository usefulness comes before embeddings/RAG infrastructure
- Telegram hashtags should become user tags
- Leroy should add summary/keyword enrichment during ingestion

### Next product milestone
Build the repository backend and UI first on the new schema, then add chunking/embeddings as phase 2.

## Critical product insight

The product is really two adjacent systems over one corpus:
- a **repository** for capture, review, filtering, and browsing
- a **knowledgebase** for retrieval, querying, and synthesis

The repository must be useful on its own before the knowledgebase layer is added.

## Dedicated specialist

The project has a dedicated ingestion specialist: **Leroy**.

Leroy is responsible for:
- source detection
- fetching
- extraction
- normalization
- fanout
- lightweight enrichment
- summary/snapshot generation
- keyword/tag suggestion

Design intent:
- Baggo receives Telegram-origin capture messages
- Baggo hands ingestion work to Leroy
- Leroy returns structured, content-first payloads
- Crashboard persists those payloads into Supabase/Postgres
- the repository UI and later knowledgebase UI operate on the stored corpus
