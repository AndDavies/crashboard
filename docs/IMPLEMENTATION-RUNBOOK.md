# IMPLEMENTATION-RUNBOOK.md — Personal Knowledgebase

## Goal

Get the Personal Knowledgebase repository flow working end-to-end with:
- Telegram Baggo Topics as the capture surface
- Baggo as front door
- Leroy as ingestion specialist
- Crashboard as structured payload receiver
- Supabase/Postgres as storage
- the new document-first schema as the backend model

## What is already done locally

- Durable project context created under `projects/personal-knowledgebase/`
- Leroy specialist role defined
- Handoff model documented
- Producer-side payload contract documented
- Cursor-ready Crashboard endpoint prompt created

## Files to use

### Local/OpenClaw-side project context
- `projects/personal-knowledgebase/LEROY.md`
- `projects/personal-knowledgebase/HANDOFF.md`
- `projects/personal-knowledgebase/PAYLOAD-CONTRACT.md`
- `projects/personal-knowledgebase/PROJECT.md`
- `projects/personal-knowledgebase/ROADMAP.md`

### Prompt files
- `projects/personal-knowledgebase/prompts/crashboard-structured-endpoint.prompt.md`
- `projects/personal-knowledgebase/prompts/leroy-producer-contract.prompt.md`

## Remaining steps

### 1. Finalize the v2 backend contract
Use these files as the source of truth:
- `projects/personal-knowledgebase/PROJECT.md`
- `projects/personal-knowledgebase/SCHEMA.md`
- `projects/personal-knowledgebase/LEROY.md`
- `projects/personal-knowledgebase/PAYLOAD-CONTRACT.md`

### 2. In Crashboard (Cursor)
Implement the structured ingestion endpoint and new repository schema against the v2 model.

Expected output:
- new tables for documents/captures/tags/links
- structured endpoint/parser for the v2 payload
- structured ingestion service
- docs
- deployed to Vercel

### 3. Notify Baggo after Vercel deploy
Once deployed, provide:
- final endpoint URL/path
- whether it reuses `OPENCLAW_INGESTION_SECRET`
- any payload/schema deviations from the contract

### 4. OpenClaw-side wiring
After the endpoint is live:
- wire Baggo Topics ingestion messages to Leroy-style extraction flow
- parse Telegram hashtags as user tags
- post structured payloads to Crashboard
- ensure Leroy adds summary/keyword enrichment
- test article first
- then PDF
- then YouTube
- then X post

### 5. Validate with live examples
Test these in order:
1. plain article with hashtags
2. PDF
3. YouTube
4. X post
5. X post with linked article fanout

## Test expectations

For each test, confirm:
- Baggo Topics message received
- URL classified correctly
- content extracted (not just URL saved)
- structured payload accepted by Crashboard
- rows appear in Supabase
- provenance preserved

## Important note

As of now, the durable contracts and prompts are ready, but runtime automation depends on the Crashboard structured endpoint being available first.
