---
name: crashboard-intelligence-worker
description: Run and resume Crashboard Intelligence collection, bounded archive backfills, Codex analysis bundles, trend publication, and queued signal research from the local Crashboard repository. Use for daily Intelligence refreshes, full or partial backfills, pending research requests, interrupted worker recovery, data-quality validation, and reporting the current worker backlog.
---

# Crashboard Intelligence Worker

Operate the local Codex worker through the deterministic commands in `scripts/intelligence-agent-worker.ts`. Let scripts handle Gmail credentials, retrieval, storage, counts, validation, checkpoints, and the active production pointer. Use Codex judgment only for the prepared JSON bundle.

## Start every run

1. Work from the Crashboard repository root.
2. Read [references/worker-contract.md](references/worker-contract.md).
3. Run `npm run intelligence:agent -- status`.
4. When signal quality is in question, run `npm run intelligence:agent -- audit-signals` before publishing. The audit must report zero blocked labels and a corpus-scale refresh must represent at least three signal types.
5. Stop with a clear configuration report when Turso or Gmail is unavailable. Never substitute Supabase.
6. Report a no-op when `dailyRefreshDue` is false and there are no pending jobs or explicit user requests.

## Daily refresh

1. Run `npm run intelligence:agent -- collect-gmail --mode incremental --batch 25`.
2. Repeat only while `hasMore` is true and the current task budget permits. Checkpointing makes continuation safe.
3. Run `npm run intelligence:agent -- refresh --kind daily` to calculate and publish the complete deterministic trend series after validation.
4. Run `npm run intelligence:agent -- audit-signals` and stop if blocked generic labels, missing signal types, or implausible source concentration remain.
5. Run `npm run intelligence:agent -- prepare --batch 100` when Codex judgment or explanation enrichment is due.
6. Read the generated inbox bundle. Do not load unrelated archive material.
7. Analyze the documents and create one outbox JSON file matching `crashboard-intelligence-analysis.v1`.
8. Keep persistent signal IDs when the bundle supplies an existing signal. Count each editorial item once. Treat chunks only as passages, never as trend votes.
9. Use plain explanations for `whyNow`, `whyItMatters`, and `whatToWatch`. Link every claimed cause to evidence; state that the cause is unknown when it is not established.
10. Import with `npm run intelligence:agent -- import --file <outbox-file>`.
11. Validate with `npm run intelligence:agent -- validate --refresh <refresh-id>`.
12. Publish only when validation returns `ok: true`, using `npm run intelligence:agent -- publish --refresh <refresh-id> --job <job-id>`.
13. For the scheduled morning run, send the validated brief with `npm run intelligence:agent -- send-brief`.
14. Run `npm run intelligence:agent -- status` again and return the run report.

## Backfill

Run `npm run intelligence:backfill -- 5 100` to process at most five Gmail pages per invocation. The worker saves its checkpoint after every page, so repeat only while the current run budget permits. When collection is complete, run `npm run intelligence:agent -- refresh --kind backfill`; it calculates the whole retained corpus, validates it, and atomically publishes only a valid generation. Then use `prepare --kind backfill --batch 100` for Codex judgment and explanation enrichment.

## Research requests

Lease the queued research job through `prepare`. Search official and original sources first, retain clickable URLs, distinguish confirmed facts from inference, and ensure research-only evidence cannot change trend scores. Import and publish the result through the same validation gate.

## Safety gates

- Never read or print Gmail refresh tokens, Turso tokens, Google secrets, session secrets, or encryption keys.
- Never write free-form SQL against production. Use the worker commands.
- Never publish a partial or invalid refresh.
- Never replace the active refresh after a failed run.
- Never enable direct OpenAI API fallback unless `INTELLIGENCE_AGENT_API_FALLBACK_ENABLED=true` was explicitly requested for the run.
- Stop for human review when evidence contradicts itself, a proposed merge changes a persistent topic's meaning, a credential is missing, validation fails, or an action would require deleting retained production data.
