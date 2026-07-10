# Trend Intelligence Workbench

Private, evidence-backed trend analysis inside the authenticated Crashboard dashboard.

## What is implemented

- `/dashboard/intelligence` — normalized overview, trend movement, event ledger, alerts, and bounded run controls.
- `/dashboard/intelligence/explorer` — hybrid full-text and semantic evidence search.
- `/dashboard/intelligence/defence` — defence, dual-use, Canada, NATO, NORAD, Five Eyes, procurement, trial, and deployment lens.
- `/dashboard/intelligence/events/[eventId]` — event detail with supporting documents and resolved entities.
- `/dashboard/intelligence/operations` — source registry, checkpoints, run ledger, digest history, sender candidates, and watchlists.
- Read-only Gmail OAuth ingestion with encrypted refresh-token storage.
- Daily incremental sync, six-month backfill, newsletter-sender discovery, and a separate email digest.
- Structured OpenAI extraction, embeddings, event/source clustering, entity aliases, evidence lineage, trend snapshots, and watchlist alerts.

The Gmail integration requests `gmail.readonly` and `gmail.send`. It never archives, labels, deletes, moves, or changes the read state of a message. Send access is used only for the configured intelligence digest.

## Database

The migration pair is:

- `20260710174527_trend_intelligence_workbench.sql`
- `20260710181250_trend_intelligence_indexes.sql`

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
- optional `OPENAI_INTELLIGENCE_EXTRACTION_MODEL`
- optional `OPENAI_INTELLIGENCE_EMBEDDING_MODEL`

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

Use `--reset` only when intentionally restarting that mode's checkpoint. Runs are idempotent by owner, source type, and Gmail message ID.

The connector bootstrap bridge accepts one JSON array per line on stdin for controlled local imports:

```bash
npm run intelligence:import-connector -- --owner "$INTELLIGENCE_OWNER_ID"
```

Do not store private mailbox exports in the repository. Pipe them directly and delete any temporary export after a verified import.

Vercel calls the sync endpoint at 08:00 and 09:00 UTC and the digest endpoint at 10:00 and 11:00 UTC. Each endpoint checks `America/Halifax` and runs only at 05:00 or 07:00 local time, respectively, so daylight-saving changes do not duplicate the job.

## Trend model

- Mention rate: evidence clusters per 100 ingested documents.
- Event rate: distinct extracted events per 100 documents.
- Momentum: smoothed current 14-day event rate versus the preceding 42-day baseline.
- Source diversity: independent publishers/source families.
- Persistence: active weeks in the eight-week window.
- Evidence confidence: mean extraction confidence and source quality.
- Trend strength: 40% momentum, 25% source diversity, 20% persistence, and 15% evidence confidence.

Counts, normalized rates, and trend strength remain separate in the UI. Every event drills down to retained evidence.

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
2. YouTube transcripts and podcast RSS/transcripts.
3. Reddit through the official API.
4. Social platforms only through official or licensed APIs.

Respect robots.txt, platform terms, paywalls, rate limits, and copyright. Aggregators are discovery leads; canonical sources should become primary evidence when available.
