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

The Gmail integration requests `gmail.readonly` and `gmail.send`. It never archives, labels, deletes, moves, or changes the read state of a message. Send access is used only for the configured intelligence digest and the bounded immediate-signal delivery described below.

## Database

The migration set is:

- `20260710174527_trend_intelligence_workbench.sql`
- `20260710181250_trend_intelligence_indexes.sql`
- `20260710220147_intelligence_pipeline_reliability.sql`
- `20260713201137_intelligence_signals_v2_foundation.sql`
- `20260713203600_intelligence_signals_v2_fk_indexes.sql`
- `20260713213000_intelligence_v2_search_quality.sql`
- `20260713214500_intelligence_story_review_clusters.sql`
- `20260713221651_intelligence_term_processing_state.sql`
- `20260713223000_intelligence_topic_merge_review.sql`
- `20260713224702_intelligence_signal_daily_totals.sql`
- `20260714053150_intelligence_v2_bounded_retention.sql`
- `20260714053200_intelligence_signal_generations.sql`
- `20260714060000_intelligence_v2_acceptance_snapshot.sql`

The first migration is compatible with both the legacy production `documents` shape and the newer checked-in ingestion snapshot. It adds the intelligence document fields without removing legacy `url`, `content`, `summary`, or source behavior.

Every intelligence table and owner-backed document row has RLS enabled with owner-specific select, insert, update, and delete policies. Server jobs use the service-role client and always filter or write the explicit owner ID.

Canonical v2 signal rows are immutable by refresh ID. A writer builds a staging
generation without touching the active series, validates its frozen term
support, rows, and daily denominators, then switches one active pointer in the
same database transaction. Overview, Explore, alerts, automatic research, and
the morning brief always filter by that pointer, so a partial refresh cannot
leak into a completed trend series.

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

Required to enable automatic trend-triggered research after source-cohort isolation is verified:

- `INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED=true`

Required to enable immediate delivery after the v2 series is verified:

- `INTELLIGENCE_IMMEDIATE_ALERTS_ENABLED=true`

Immediate delivery selects only **Strong** signals classified as **New** or **Rising** with at least one distinct real-world action or primary-source item. It uses a deterministic daily claim and sends no more than two messages per Halifax calendar day, including when both daylight-saving cron triggers invoke the route.

Research creates at most five automatic leads per Halifax calendar day and only for **Strong New/Rising** signals that lack a primary source, concrete action, or supported explanation. Each lead runs an official-domain pass before broader discovery, with low reasoning, medium search context, a maximum of four web searches, five retained URLs per search, two transient retries, 100 successfully fetched pages per day, a `$5` estimated daily OpenAI ceiling, and a seven-day cooldown measured from completion. A budget reservation is recorded before each API call sequence, so failures and interrupted runs cannot silently reopen the day’s budget.

Every retained page is checked against `robots.txt`, passed through the shared document pipeline, and deduplicated by its canonical document identity. Research results retain the complete consulted-source list and clickable citations, plus structured claims, dates, organizations, amounts, milestones, **What changed**, **Why now**, **Why it matters**, and **What to watch**. A causal explanation without a retained supporting URL is stored as unknown, and an assessment without supported claims is recorded as unknown/unchanged.

Research sources always enter the `research` cohort—even when that domain was previously promoted—and cannot affect a trend. Selecting **Approve as regular source** starts measurement prospectively; it does not rewrite historical scores or convert the trend-triggered documents that motivated the research into historical trend votes.

Optional:

- `INTELLIGENCE_DIGEST_TO` — otherwise the connected Gmail address receives the digest
- `GOOGLE_GMAIL_REDIRECT_URI` — otherwise derived from `NEXT_PUBLIC_SITE_URL`
- `INTELLIGENCE_JOB_SECRET` — local non-Vercel bearer fallback

## Approved YouTube, Reddit, and social APIs

These adapters never scrape unofficial transcripts or social webpages. Every collected document retains its source cohort and prospective measurement activation date, so a research-only source cannot change a trend score.

For a YouTube source:

1. Enable the [YouTube Data API](https://developers.google.com/youtube/v3/docs) in an approved Google Cloud project.
2. Set `YOUTUBE_DATA_API_KEY`.
3. Configure the source with one of `channel_id`, `playlist_id`, or `video_ids`.
4. To include captions, set `include_captions: true` and provide `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, and `YOUTUBE_OAUTH_REFRESH_TOKEN` authorized for `youtube.force-ssl`. The official [`captions.list`](https://developers.google.com/youtube/v3/docs/captions/list) and [`captions.download`](https://developers.google.com/youtube/v3/docs/captions/download) methods can return `403` when the account lacks permission; in that case Crashboard keeps the official video metadata and description and records that captions were not permitted.

For a Reddit source:

1. Obtain explicit Reddit API approval and an OAuth application.
2. Set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.
3. Configure the source with `source_type: reddit` and a `subreddit` value. Crashboard reads the subreddit's `new` listing through `oauth.reddit.com`; the result is always classified as community evidence.

For an X source:

1. Use an approved X developer project and set `X_API_BEARER_TOKEN`.
2. Configure `source_type: social`, `adapter: x_api_v2`, `x_user_id`, and `x_username`.
3. Crashboard reads the official user-post timeline and classifies the result as community evidence.

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

### Local v2 maintenance with no OpenAI API calls

The large deterministic v2 maintenance stages can run from this repository
while continuing to read and write the configured Supabase project. Local in
this context means that the job is orchestrated on this computer; it does not
copy the production database locally.

Use the dedicated deduplication command after changing story or event matching
logic. It accepts an explicit owner and complete-day boundary and never uses
OpenAI:

```bash
npm run intelligence:v2-dedupe -- \
  --owner "<Supabase Auth user UUID>" \
  --complete-through "<YYYY-MM-DD>"
```

Do not run deduplication concurrently with a backfill or scheduled signal
refresh. The command rejects an invalid date and any date later than the latest
complete Halifax day.

Resume an unfinished v2 backfill without OpenAI API calls only after current
segment and concept embeddings are complete:

```bash
npm run intelligence:v2-backfill -- \
  --owner "<Supabase Auth user UUID>" \
  --run-id "<unfinished v2 backfill run UUID>" \
  --signal-term-batch 100
```

The local v2 backfill now disables OpenAI by default, removing
`OPENAI_API_KEY` and `CODEX_API_KEY` from the process even when either is
present in the environment or `.env.local`.
`--no-openai` remains an explicit backwards-compatible spelling. Before moving
past either embedding phase, the command verifies
that every current eligible segment and every active or candidate concept has a
production-compatible embedding. It stops with an explicit error if either set
is incomplete; it never silently substitutes a different vector model or marks
missing embeddings complete.

Only `--allow-paid-openai` re-enables the backfill's missing segment or concept
embedding calls. Use it only when Platform API spend is intentional; without
that flag, incomplete embedding coverage stops the run with an exact count.

Topic assignment, nearest-neighbour clustering, candidate creation, story and
event deduplication, and signal calculation remain deterministic in this mode.
Candidate topics receive deterministic names and are marked as pending a later
local Codex review. `--codex-review-topics` remains a backwards-compatible alias
for `--no-openai`; despite its historical name, it does not invoke Codex.

After a completed backfill, create the first evaluation snapshot, then run and
record each fixed-window validation refresh separately. The evaluator requires
the exact completed run ID and complete-through date:

```bash
npm run intelligence:v2-evaluate -- init \
  --owner "<Supabase Auth user UUID>" \
  --run-id "<completed backfill run UUID>" \
  --complete-through "<backfill YYYY-MM-DD>"

npm run intelligence:v2-signal-refresh -- \
  --owner "<Supabase Auth user UUID>" \
  --target 1

npm run intelligence:v2-evaluate -- refresh \
  --owner "<Supabase Auth user UUID>" \
  --run-id "<completed target-1 run UUID>" \
  --complete-through "<backfill YYYY-MM-DD>"

npm run intelligence:v2-evaluate -- report
```

Repeat the signal-refresh and evaluator pair through target 6, then run the
separate current-window refresh. The complete command sequence and July 2026
run identities are in `docs/INTELLIGENCE_V2_EVALUATION.md`.

The local signal-refresh command deletes both `OPENAI_API_KEY` and
`CODEX_API_KEY` from its own process after loading `.env.local`; neither the six
cloned validations nor the final
ordinary current-window refresh can make OpenAI API calls. Evaluation `init`,
`refresh`, `quality`, `benchmark`, and `report` also remove those local keys and
make no direct OpenAI calls. The benchmark can still cause the deployed search
route to use the server's configured query-embedding key. Creating the evaluation
snapshot before the later signal refreshes is required to measure topic-label
stability.

The six local validation refreshes reuse the completed backfill's finalized
term-support snapshot. The local runner reads the backfill's exact refresh ID,
extraction version, and date window, then copies eligible segments and retained
term ordinals into each validation refresh in atomic batches of at most 2,000
rows. Clone progress is stored in Postgres and mirrored into the run checkpoint,
so an interrupted cursor-zero run resumes the same clone instead of restarting
or re-aggregating the archive. A source with unprocessed segments or unfinished
ordinals, a conflicting version/window, and a non-empty target not created by
the clone RPC all fail closed. Once the clone is exact, scoring starts at the
first term batch; Topics, Organizations, Systems, Programmes, and Events are
still recalculated normally. Scheduled production refreshes and the backfill
continue to build their own support snapshots.

These six cloned runs are deterministic stability validation only. They remain
pinned to the completed backfill's exact end date even when a newer complete day
exists, and the clone refuses a mismatched window. `--require-current-window`
first verifies all six exact-window runs, then creates or resumes exactly one
ordinary zero-API refresh through the latest complete Halifax day. The final run
does not clone term support because its date window differs. It is required
before current production readiness and browser QA are claimed. Re-running the
same command is idempotent: completed windows are reported without another run.

Each cloned validation generation is temporary. After scoring, the runner
stores the QA function's full-series and topic-label counts and fingerprints in
the run checkpoint, then deletes that non-promoted generation in bounded pages
before marking the run complete or starting the next clone. An interruption
resumes from the saved fingerprint and deletion counters. Only the compact
checkpoint remains; the six validations cannot accumulate more than a million
wide daily rows or replace the active production generation.

The cost boundary is explicit:

| Work | OpenAI API use |
|---|---|
| Exact term extraction, deduplication, topic clustering with stored vectors, signal scoring, quality SQL, and evaluation files | None |
| Codex review using the local Ollama runner | None; no ChatGPT/Codex plan quota |
| Missing or changed segment embeddings | Required; must use the configured embedding model |
| Missing or changed concept embeddings | Required; must use the configured embedding model |
| Structured document enrichment, model-assisted segmentation, and automatic research | Responses API when enabled |
| Production hybrid search | One query embedding per uncached search request |
| Evaluation benchmark | Production search requests use the production server's key; an empty local key cannot disable them |

Codex can review labels, classifications, and evaluation samples through the
installed Ollama model without using a Platform API key or ChatGPT/Codex plan
quota. The bundled Codex CLI still supplies the agent loop and file tools, but
the model inference is on-device. Create the idempotent local alias, then run
one bounded unresolved section at a time:

```bash
npm run intelligence:v2-local-review -- --setup
npm run intelligence:v2-local-review -- --section story-duplicates
npm run intelligence:v2-local-review -- --section event-duplicates
npm run intelligence:v2-local-review -- --section segmentations
npm run intelligence:v2-local-review -- --section event-topic-links
```

Add `--all-pending` to any one section for an unattended pass. Each accepted
batch is merged independently, so an interruption preserves all prior batches
and cannot leave a half-written review file.

The local runner removes both API-key variables, uses a fresh temporary Codex
home, disables web search and telemetry, blinds generated predictions, and
gives the model no write access to the retained file. The host validates structured output and
atomically merges only exact reviewer fields under an exclusive lock. It is
slower than hosted inference on the current 24 GB M4 Mac, so ordinary sections
default to batches of ten. Segmentation is fixed at one complete source per run
and is never truncated; other sections support `--limit 1` through
`--limit 20`.

Hosted Codex through the saved ChatGPT login remains a zero-Platform-API
alternative, but it is remote inference and consumes applicable ChatGPT/Codex
plan quota. Neither local nor hosted Codex can
replace the configured embedding model inside the existing index: changing to a
local embedding model would require re-embedding the whole corpus and concepts,
changing query embeddings, and recalibrating similarity thresholds.

On this computer, the authenticated Codex binary is:

```bash
CODEX_BIN="/Applications/ChatGPT.app/Contents/Resources/codex"

env -u OPENAI_API_KEY -u CODEX_API_KEY "$CODEX_BIN" login status
```

The status command must print `Logged in using ChatGPT` before a zero-Platform-
API review. Use the bounded commands in `docs/INTELLIGENCE_V2_EVALUATION.md`;
they confine each Codex pass to the private ignored evaluation directory.

Do not run `/opt/homebrew/bin/codex` for this workflow; that installation is
not the authenticated working binary. Do not run Codex as an embedding
substitute, and do not add `--allow-paid-openai` to the backfill unless Platform
API spend is explicitly intended: missing or
changed production-compatible content embeddings still require the Platform
API. Large deduplication, stored-vector clustering, signal refresh, quality SQL,
evaluation generation, and human/Codex review remain zero-API local work.

The manual research CLI is a paid boundary and fails closed unless the caller
confirms that spend in the command itself:

```bash
npm run intelligence:research -- \
  --owner "<Supabase Auth user UUID>" \
  --allow-paid-openai
```

Do not add `--allow-paid-openai` during the local backfill, six-refresh, or
evaluation workflow. The flag protects only the manual CLI; scheduled
production research retains its separate feature flag and budget controls.

Use `--reset` only when intentionally restarting that mode's checkpoint. Runs are idempotent by owner, source type, and Gmail message ID. Re-enrichment replaces the document's previous model-event evidence while retaining evidence contributed by other documents.

Production syncs persist their Gmail page cursor, pending message IDs, counters, and heartbeat after every message. A worker stops before the Vercel hard limit and the next invocation resumes the saved pending IDs. A partial unique index permits only one running job per source; abandoned jobs are reconciled after their heartbeat expires.

The connector bootstrap bridge accepts one JSON array per line on stdin for controlled local imports:

```bash
npm run intelligence:import-connector -- --owner "$INTELLIGENCE_OWNER_ID"
```

Do not store private mailbox exports in the repository. Pipe them directly and delete any temporary export after a verified import.

Vercel calls external collection at 07:00 and 08:00 UTC, Gmail sync at 08:00 and 09:00 UTC, signal refresh every ten minutes during both the 09:00 and 10:00 UTC hours, research at 09:20 and 10:20 UTC, and digest delivery at 10:00 and 11:00 UTC. Weekly topic maintenance runs on Sunday at 09:40 and 10:40 UTC. Each endpoint checks `America/Halifax`, so only the trigger hour corresponding to 04:00, 05:00, 06:00, or 07:00 local time performs work through daylight-saving changes. During the valid 06:00 hour, the signal refresh resumes its saved maintenance or scoring cursor every ten minutes. Once the complete generation is current, later calls skip scoring and remove one bounded page of stale v2 staging data while preserving active, in-flight, signal-referenced, and recent rollback generations. The 20-minute research offset allows the first canonical refresh invocation to finish; research still reads only a completed generation and otherwise waits for the next schedule.

Register the approved official source candidates without activating them:

```bash
npx tsx scripts/intelligence-collect.ts --seed-official
```

This creates concrete CanadaBuys, DND/PSPC, US DoD, NATO/NCIA/NSPA, UK Find a Tender, EU TED, and representative defence-company press-room candidates. The company candidates currently cover Lockheed Martin, BAE Systems, Saab, Rheinmetall, and Northrop Grumman. Every seeded row remains inactive, has no measurement activation date, and requires review before promotion; measurement begins prospectively on promotion.

CanadaBuys uses the official Open Government contract-history dataset adapter. UK notices use the anonymous [Find a Tender OCDS release-package API](https://www.find-tender.service.gov.uk/Developer/Documentation), with second-resolution `updatedFrom`/`updatedTo` windows and the API-provided cursor. EU notices use the anonymous [TED v3 Search API](https://docs.ted.europa.eu/api/latest/search.html) in iteration mode so a multi-page result remains a consistent snapshot. The seeded TED source uses the live-verified `main-classification-proc=(35* OR 734* OR 7522*)` defence/security CPV filter; an approved source can set a different `expert_query` when broader coverage and collection capacity have been reviewed. Both adapters pin their official HTTPS host and path and reject replacement endpoints.

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
2. YouTube metadata and officially accessible captions, plus podcast RSS and publisher-provided transcripts. Podcast transcripts are accepted only when declared in the Podcasting 2.0 RSS namespace, use a supported transcript media type, resolve to a public HTTPS URL, and pass their own robots check. The collector does not use unofficial transcript services.
3. Reddit through the official API.
4. Social platforms only through official or licensed APIs.

Respect robots.txt, platform terms, paywalls, rate limits, and copyright. Collection requests are paced per domain. HTTP 408/425/429/5xx responses and transient network failures receive at most two retries; `Retry-After` is honored (with a bounded in-request wait) and retained as the source cooldown when retries are exhausted. Redirects are followed manually, with every hop checked against the public-network allowlist. Responses are rejected from `Content-Length` or while streaming once they exceed 5 MB. A transient robots failure fails closed for that collection attempt. Aggregators are discovery leads; canonical sources should become primary evidence when available.
