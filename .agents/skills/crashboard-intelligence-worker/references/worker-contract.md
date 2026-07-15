# Worker contract

## Environment

Required for the shared Turso database:

- `INTELLIGENCE_STORE=turso`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `INTELLIGENCE_OWNER_ID`
- `INTELLIGENCE_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_GMAIL_CLIENT_ID`
- `GOOGLE_GMAIL_CLIENT_SECRET`

Dashboard login additionally requires:

- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_ALLOWED_EMAILS`
- `GOOGLE_DASHBOARD_REDIRECT_URI`

The Google dashboard client defaults to the Gmail client ID and secret. The authorized callback must include `/api/auth/google/callback` for both the local and production origins.

## Deterministic commands

```text
npm run intelligence:agent -- init
npm run intelligence:agent -- status
npm run intelligence:agent -- audit-signals
npm run intelligence:agent -- collect-gmail --mode incremental|backfill --batch 1..100
npm run intelligence:agent -- prepare --batch 1..100 [--kind backfill]
npm run intelligence:agent -- import --file <analysis.json>
npm run intelligence:agent -- validate --refresh <uuid>
npm run intelligence:agent -- publish --refresh <uuid> --job <uuid>
npm run intelligence:agent -- send-brief
npm run intelligence:agent -- smoke --documents 10|100
```

All commands print JSON. A non-zero exit means the step failed and must not be skipped.

## Bundle boundaries

Inbox files use `crashboard-intelligence-work-bundle.v1` and contain no more than 100 editorial documents. Outbox files must use `crashboard-intelligence-analysis.v1`. The application validates all fields with Zod before any signal is imported.

Every signal must include a stable ID, kind, label, direction, evidence strength, current and previous share of coverage, item/story/source/action counts, a daily or weekly series, short explanations, and evidence rows whose `documentId` exists in Turso.

Generic calendar terms, interface language, newsletter boilerplate, and ordinary verbs are invalid signal labels. Corpus-scale refreshes must include stable topics plus at least two other supported signal types among keywords, organizations, systems, and programmes. The deterministic layer uses source-balanced ranking so one high-volume newsletter cannot manufacture a top signal.

## Publication invariant

The dashboard reads one row from `intelligence_active_refresh`. A worker builds a new refresh separately. Validation must pass before one atomic transaction marks the prior generation superseded and activates the new generation. A failed or interrupted build leaves the previous generation visible.
