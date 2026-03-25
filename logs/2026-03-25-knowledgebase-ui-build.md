# Knowledgebase UI build log

Date: 2026-03-25
Project: Crashboard
Area: Dashboard / Personal Knowledgebase

## Summary
Built the first repository GUI for Personal Knowledgebase inside the Crashboard dashboard.

## Implemented
- Added a new `Knowledgebase` section to the dashboard left navigation.
- Added repository list page at `/dashboard/knowledgebase`.
- Added document detail page at `/dashboard/knowledgebase/[documentId]`.
- Added basic server-driven search and filters:
  - keyword search
  - source type
  - review status
  - ingestion status
  - tag
  - sort
- Added review-status update action on the document detail page.
- Added a server-side Knowledgebase data layer backed by Supabase PKB tables:
  - `documents`
  - `document_captures`
  - `tags`
  - `document_tags`
  - `document_links`

## Files added
- `src/app/dashboard/knowledgebase/page.tsx`
- `src/app/dashboard/knowledgebase/[documentId]/page.tsx`
- `src/components/dashboard/knowledgebase/knowledgebase-shared.tsx`
- `src/components/dashboard/knowledgebase/knowledgebase-summary-cards.tsx`
- `src/components/dashboard/knowledgebase/knowledgebase-filters.tsx`
- `src/components/dashboard/knowledgebase/knowledgebase-list.tsx`
- `src/components/dashboard/knowledgebase/knowledgebase-document-detail.tsx`
- `src/components/dashboard/knowledgebase/review-status-form.tsx`
- `src/lib/knowledgebase/data.ts`
- `logs/2026-03-25-knowledgebase-ui-build.md`

## Files updated
- `src/lib/dashboard/nav-config.ts`

## Validation
- `npx eslint 'src/app/dashboard/knowledgebase/page.tsx' 'src/app/dashboard/knowledgebase/[documentId]/page.tsx' src/components/dashboard/knowledgebase/*.tsx src/lib/knowledgebase/data.ts src/lib/dashboard/nav-config.ts`
- `npx tsc --noEmit`

## Notes for future review
- Current repository UI is intentionally v1-scoped.
- Review status editing is only on the detail page for now.
- Search is implemented with broad document-field matching and tag filtering via join lookup.
- The live schema snapshot indicates `documents.search_document` exists; future search refinement should likely move toward that field.
- Current ingestion code appears to insert documents directly; duplicate/canonical handling may need a later pass.

## Follow-up pass completed
A second pass was completed after initial delivery to address the next planned improvements.

### Added / improved
- Search now uses `documents.search_document` through Postgres full-text search (`textSearch`) instead of broad `ilike` matching.
- Content rendering was refined to present extracted text/transcripts in structured paragraph blocks with better readability.
- Pagination/count display was improved to show visible result ranges and active sort context.
- Structured ingestion now performs stronger document reuse/upsert behavior:
  - derives a canonical key when possible
  - checks existing documents by external id, canonical key, canonical URL, then original URL
  - updates an existing canonical document instead of blindly inserting duplicates
  - still records a fresh `document_captures` row for each save
  - avoids duplicate related-link inserts for the same document/relation/url
  - uses upsert for `document_tags` on the composite key

## Recommended next steps
- Add capture metadata drilldown and related-document linking when `to_document_id` is populated.
- Improve markdown rendering further if rich source formatting becomes important.
- Add authenticated read policies if/when dashboard access should stop relying on server-side trusted reads.
- Consider surfacing canonical/duplicate relationships explicitly in the UI once ingestion volume grows.

## Multi-tag filter update
A follow-up UI refinement replaced the tag dropdown with a visible multi-select tag picker.

### Added / changed
- Tags are now displayed directly in the filters card as clickable chips.
- Multiple tags can be selected and deselected.
- Selected tags are encoded with repeated `tag` query params.
- Current tag filtering uses OR semantics (documents matching any selected tag).
- Tag chips now use color by tag type for easier scanning.
- Selected tags are sorted to the front of the tag list.

## Responsiveness pass
A further pass focused on making the filter interactions feel faster without abandoning server-backed data.

### Added / changed
- `KnowledgebaseFilters` was converted to a client component.
- Search now updates via debounced client-side URL replacement instead of a manual form round-trip.
- Tag toggles, select filters, sort changes, and reset now use client-side router updates with `scroll: false`.
- Added a lightweight in-panel `Updating…` pending indicator during route refreshes.
- Added `src/app/dashboard/knowledgebase/loading.tsx` for route-level skeleton loading during data refreshes.
- Kept server-backed list rendering and URL-driven state so the data model and deep-linking remain intact.

## Query/index optimization pass
A further pass focused on reducing repeat query work and adding the database indexes the repository workload needs.

### Added / changed
- Added migration `supabase/migrations/20260325165000_knowledgebase_query_indexes.sql`.
- Added indexes for:
  - `documents.search_document` (GIN full-text search)
  - `documents.captured_at`
  - `documents.published_at`
  - `documents.title`
  - `documents.review_status`
  - `documents.ingestion_status`
  - `documents.source_type`
  - `documents.canonical_key`
  - `documents(source_type, external_id)`
  - `documents.canonical_url`
  - `documents.original_url`
  - `tags.tag_normalized`
  - `tags(tag_normalized, tag_type)`
  - `document_tags(tag_id, document_id)`
  - `document_tags(document_id)`
  - `document_captures(document_id, captured_at desc)`
  - `document_links(from_document_id)`
  - `document_links(to_document_id)`
  - `document_links(from_document_id, relation, url)`
- Cached Knowledgebase summary stats with `unstable_cache` (30s revalidate).
- Cached Knowledgebase filter/tag options with `unstable_cache` (5min revalidate).

### Notes
- This pass improves the repeat-read path without changing the user-facing URL/state model.
- The migration still needs to be applied to the database for the indexes to take effect in Supabase.
