# Trend Intelligence Workbench

Private, evidence-backed trend analysis inside the authenticated Crashboard dashboard.

## What is implemented

- `/dashboard/intelligence` — the plain-language daily overview: new, rising, sustained, cooling, and completed research.
- `/dashboard/intelligence/explore` — topics, keywords, organizations, systems, comparison, hybrid evidence search, and saved lenses.
- `/dashboard/intelligence/sources` — connectors, source cohorts, syncs, research jobs, costs, and data health.
- `/dashboard/intelligence/events/[eventId]` — event detail with supporting documents and resolved entities.
- `/dashboard/intelligence/operations` — source registry, checkpoints, run ledger, digest history, sender candidates, and watchlists.
- Read-only Gmail OAuth ingestion with encrypted refresh-token storage.
- Daily incremental sync, six-month backfill, newsletter-sender discovery, and a separate email digest.
- Structured OpenAI extraction, embeddings, event/source clustering, entity aliases, evidence lineage, trend snapshots, and watchlist alerts.

The Gmail integration requests `gmail.readonly` and `gmail.send`. It never archives, labels, deletes, moves, or changes the read state of a message. Send access is used only for the configured intelligence digest.

## Database

The migration set is:

- `20260710174527_trend_intelligence_workbench.sql`
- `20260710181250_trend_intelligence_indexes.sql`
- `20260710220147_intelligence_pipeline_reliability.sql`
- `20260713201137_intelligence_signals_v2_foundation.sql`
- `20260713203600_intelligence_signals_v2_fk_indexes.sql`

The first migration is compatible with both the legacy production `documents` shape and the newer checked-in ingestion snapshot. It adds the intelligence document fields without removing legacy `url`, `content`, `summary`, or source behavior.

Every intelligence table and owner-backed document row has RLS enabled with owner-specific select, insert, update, and delete policies. Server jobs use the service-role client and always filter or write the explicit owner ID.

## Required configuration

Copy the Trend Intelligence variables from `.env.example` into `.env.local` and the production environment.

Required for Gmail ingestion:

- `GOOGLE_GMAIL_CLIENT_ID`
- `GOOGLE_GMAIL_CLIENT_SECRET`
- `INTELLIGENCE_TOKEN_ENCRYPTION_KEY` — a long random value of at least 32 characters

Required for scheduled jobs:

- `INTELLIGENCE_OWNER_ID` — the Supabase Auth user UUID that owns the private corpus
- `CRON_SECRET`

Already used by enrichment:

- `OPENAI_API_KEY`
- optional `OPENAI_INTELLIGENCE_EXTRACTION_MODEL` — defaults to `gpt-5.4-mini`
- optional `OPENAI_INTELLIGENCE_EMBEDDING_MODEL`

Bounded-research defaults (no extra configuration required):

- `OPENAI_INTELLIGENCE_RESEARCH_MODEL=gpt-5.6-terra`
- `INTELLIGENCE_RESEARCH_DAILY_BUDGET_USD=5`
- `INTELLIGENCE_RESEARCH_MAX_USD_PER_LEAD=1`

Required to enable the v2 delivery surfaces after migration and backfill verification:

- `INTELLIGENCE_SIGNALS_V2=true`

Research runs at low reasoning with medium search context, a maximum of four web searches per lead, five retained URLs per search, 100 fetched pages per day, and a seven-day per-signal cooldown. Research sources enter the `research` cohort and cannot affect a trend. Selecting **Approve as regular source** starts measurement prospectively; it does not rewrite historical scores.

Optional:

- `INTELLIGENCE_DIGEST_TO` — otherwise the connected Gmail address receives the digest
- `GOOGLE_GMAIL_REDIRECT_URI` — otherwise derived from `NEXT_PUBLIC_SITE_URL`
- `INTELLIGENCE_JOB_SECRET` — local non-Vercel bearer fallback

## Google Cloud setup

1. Create or choose a Google Cloud project and enable the Gmail API.
2. Configure the OAuth consent screen for the account that owns the newsletter corpus.
3. Create a Web application OAuth client.
4. Register these exact callbacks:
   - `http://localhost:3000/api/intelligence/google/callback`
   - `https://crashboard.dev/api/intelligence/google/callback`
5. Add the client ID and secret to local and production environment variables.
6. Open `/dashboard/intelligence` and select **Connect Gmail**.

The callback stores the offline refresh token encrypted with AES-256-GCM. Plaintext tokens are never returned to the browser or written to source files.

## Backfill and daily operation

The authoritative six-month window is January 10 through July 10, 2026. The four starting labels are:

- `Newsletters/AI`
- `Newsletters/Business`
- `Newsletters/Cybersecurity`
- `Newsletters/Health and Fitness`

The verified ID baseline is 1,927 unique messages. The parent `Newsletters` label is not used as the authoritative search surface.

From the dashboard, **Continue backfill** processes the next checkpointed batch. For a long-running local backfill:

```bash
npm run intelligence:sync -- \
  --owner "$INTELLIGENCE_OWNER_ID" \
  --mode backfill \
  --start 2026-01-10 \
  --end 2026-07-10 \
  --batch 10 \
  --all
```

Use `--reset` only when intentionally restarting that mode's checkpoint. Runs are idempotent by owner, source type, and Gmail message ID. Re-enrichment replaces the document's previous model-event evidence while retaining evidence contributed by other documents.

Production syncs persist their Gmail page cursor, pending message IDs, counters, and heartbeat after every message. A worker stops before the Vercel hard limit and the next invocation resumes the saved pending IDs. A partial unique index permits only one running job per source; abandoned jobs are reconciled after their heartbeat expires.

The connector bootstrap bridge accepts one JSON array per line on stdin for controlled local imports:

```bash
npm run intelligence:import-connector -- --owner "$INTELLIGENCE_OWNER_ID"
```

Do not store private mailbox exports in the repository. Pipe them directly and delete any temporary export after a verified import.

Vercel calls external collection at 07:00 and 08:00 UTC, Gmail sync at 08:00 and 09:00 UTC, signal refresh at 09:00 and 10:00 UTC, research at 09:20 and 10:20 UTC, and digest delivery at 10:00 and 11:00 UTC. Weekly topic maintenance runs on Sunday at 09:40 and 10:40 UTC. Each endpoint checks `America/Halifax`, so only the trigger corresponding to 04:00, 05:00, 06:00, or 07:00 local time performs work through daylight-saving changes. The 20-minute research offset ensures the canonical signal refresh finishes first.

Register the approved official source candidates without activating them:

```bash
npx tsx scripts/intelligence-collect.ts --seed-official
```

This creates concrete CanadaBuys, DND/PSPC, US DoD, NATO/NCIA/NSPA, and UK/EU candidates. CanadaBuys uses the official Open Government contract-history dataset adapter. Review and activate a candidate before its first scheduled collection.

## Trend model

- One high-confidence editorial segment is one measurement item. A poorly segmented newsletter contributes one labelled coarse item; chunks never receive independent trend votes.
- Share of coverage is supporting measurement items divided by all eligible items for the same day. This normalization prevents corpus growth from manufacturing a trend.
- Exact terms also track capped mentions per 10,000 editorial tokens, supporting items, title presence, and normalized source families.
- Momentum compares the latest 28 complete days with the preceding 28. Acceleration compares the change in weekly slope; burst, persistence, novelty, and real-world action clusters add independent evidence.
- New, Rising, Sustained, and Cooling require minimum item and source-family support. Strong, Moderate, and Early summarize evidence quality without exposing an opaque score.
- Story and event clusters are counted separately from documents so repeated newsletter descriptions of one announcement do not appear as separate actions.
- Only approved `measurement` cohort sources can affect scores. Promoted sources contribute prospectively from `measurement_active_from`.

The hidden rank combines momentum, acceleration or burst, source breadth, action evidence, persistence, novelty, and confidence. The interface presents these understandable drivers, not the score. Every visible explanation retains linked evidence.

## Verification commands

```bash
npx eslint src/lib/intelligence src/components/dashboard/intelligence src/app/dashboard/intelligence src/app/api/intelligence scripts/intelligence-*.ts
npx vitest run src/lib/intelligence/scoring.test.ts src/lib/intelligence/enrichment.test.ts
npm run build
```

After schema changes, run both Supabase security and performance advisors. Do not treat a successful migration as sufficient verification.

## Expansion adapters

The `IntelligenceSourceAdapter` contract supports `discover`, checkpointed `backfill`, and incremental `sync`. Add sources in this order:

1. Official government, procurement, defence-agency, company-release, RSS, and source-portfolio pages.
2. YouTube metadata and officially accessible captions, plus podcast RSS and publisher-provided transcripts.
3. Reddit through the official API.
4. Social platforms only through official or licensed APIs.

Respect robots.txt, platform terms, paywalls, rate limits, and copyright. Aggregators are discovery leads; canonical sources should become primary evidence when available.
