# Public Intelligence UI refresh — design QA

Date: 2026-07-15  
Production: https://crashboard.dev/intelligence  
Scope: all prioritized P0, P1, and P2 UI/UX edits; no stored content or analytical conclusions changed.

## Reference and implementation evidence

All desktop comparisons used the same 1425 × 990 viewport and equivalent populated production states.

| Route | Baseline | Implemented |
| --- | --- | --- |
| Overview | `/tmp/crashboard-public-ux-audit-2026-07-15/02-intelligence-overview.jpg` | `/tmp/crashboard-public-ux-refresh-2026-07-15/qa-overview-1425x990.png` |
| Explore | `/tmp/crashboard-public-ux-audit-2026-07-15/03-explore-workspace.jpg` | `/tmp/crashboard-public-ux-refresh-2026-07-15/qa-explore-1425x990.png` |
| Source archive | `/tmp/crashboard-public-ux-audit-2026-07-15/06-source-archive.jpg` | `/tmp/crashboard-public-ux-refresh-2026-07-15/qa-archive-1425x990.png` |

Combined side-by-side comparison: `/tmp/crashboard-public-ux-refresh-2026-07-15/comparison-full.png`

Additional production evidence:

- Mobile overview, 390 × 844: `/tmp/crashboard-public-ux-refresh-2026-07-15/overview-mobile-production.png`
- Mobile search, 390 × 844: `/tmp/crashboard-public-ux-refresh-2026-07-15/search-mobile-production-refresh.png`
- Populated source archive: `/tmp/crashboard-public-ux-refresh-2026-07-15/archive-desktop-production.png`
- Source detail and connected trends: `/tmp/crashboard-public-ux-refresh-2026-07-15/source-detail-full-production.png`
- Trend detail and chart: `/tmp/crashboard-public-ux-refresh-2026-07-15/trend-nato-full-production.png`

## Acceptance review

### P0

- Shared Intelligence navigation is prominent and consistent across Overview, Explore, trend detail, source archive, and source detail.
- Each section link has an icon, 44 px target height, explicit active tint and accent indicator, hover state, and keyboard focus ring.
- Search immediately replaces the comparison workspace with grouped trend and source results; previous selected/compared signals do not remain in the URL or UI.
- Cards, source rows, evidence rows, related trends, and wayfinding actions use consistent full-surface click treatment and directional cues.
- Overview attention cards and movement summaries are fully actionable without nested links.
- Trend and source details expose clear back, compare, browse, and related-content routes.
- Public excerpts remove URLs, tracking fragments, newsletter footers, sponsor blocks, subscription copy, and recipient email addresses at presentation time only.

### P1

- Explore filters use the plain labels Focus and Type, visible selected states, a concise active-filter summary, and Clear filters.
- The source archive supports search, type, publisher, date, sort, clear filters, and stable previous/next pagination.
- Source rows expose up to three connected trend chips, and source detail moves connected analysis beside the excerpt on desktop and below it on mobile.
- Breadcrumbs keep the current long source title compact while retaining the full label in its title attribute.
- All changed links, buttons, filters, and result surfaces have explicit `focus-visible` treatment.

### P2

- Section navigation uses the existing Lucide icon system.
- Hover and selected-state transitions are subtle and guarded by reduced-motion-safe utilities.
- Search terms are highlighted in matching trend and evidence results.
- Suggested searches appear before a query is submitted.

## Functional and responsive checks

- Search for `NATO`: 12 matching trends and 26 matching sources; exact-match highlighting visible; search-only result mode confirmed.
- Archive filter combination `email_newsletter`, past month, oldest first: selected values persisted in the URL and results were ordered oldest first.
- Archive pagination: Next reached page 2 and Previous became available.
- Trend action: Compare this trend opened Explore with NATO selected and in comparison.
- Mobile width: 390 px viewport and 390 px document width; no horizontal overflow.
- Section navigation targets: three links at 44 px high; active state and 2 px inset keyboard ring confirmed.
- Source detail: back link and connected trends visible; sponsor copy absent after final deployment.
- Production deployment status for commit `4a78b3a`: successful.

## Visual QA history

1. Baseline review found low-emphasis text navigation, buried search results, inconsistent clickability, limited archive controls, and weak deep-page wayfinding.
2. First local pass implemented the shared navigation, results mode, interaction language, filters, pagination, and deep-page actions; desktop and mobile empty states passed.
3. First populated production pass exposed additional newsletter chrome and one recipient email line. The presentation sanitizer was tightened and protected with regression tests.
4. Final production pass confirmed clean populated excerpts, connected trend surfaces, mobile flow, focus states, archive controls, and deployment health.

## Scorecard

| Area | Final score |
| --- | ---: |
| Navigation and wayfinding | 9.2 / 10 |
| Explore and search flow | 9.0 / 10 |
| Source archive and detail | 9.0 / 10 |
| Interaction clarity | 9.0 / 10 |
| Responsive and keyboard accessibility | 9.1 / 10 |
| Overall | 9.1 / 10 |

final result: passed
