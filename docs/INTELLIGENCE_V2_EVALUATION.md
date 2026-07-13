# Intelligence v2 retained evaluation

The evaluation set is deliberately local. It contains newsletter titles, excerpts, search queries, and source URLs, so its directory is ignored by Git and every evaluation command refuses to write outside `.local/intelligence-evaluation/`.

## 1. Create or refresh the fixed review set

Run this after the Intelligence v2 backfill and signal refresh:

```bash
npm run intelligence:v2-evaluate -- init --owner <dashboard-user-id>
```

This creates `.local/intelligence-evaluation/review.json` with exactly:

- 100 likely duplicate or same-story pairs, split between clustered pairs and hard negative candidates.
- 50 newsletter segmentation examples, prioritizing the lowest-confidence parses.
- 30 top six-month Topic or Keyword movements.
- 50 event-to-topic links.
- 20 searches spanning acronyms, systems, organizations, topics, and natural-language questions.

Running `refresh` instead of `init` rebuilds the samples while retaining reviews that still have the same stable ID. It also compares the prior and current label for retained signals.

## 2. Review the private file

Edit only the reviewer fields in `review.json`:

- Duplicate pairs: set `sameStory` to `true` or `false`.
- Segmentations: set `acceptable`, `correctEditorialItemCount`, and `containsTrendEligibleBoilerplate`.
- Surges: set `isRealTrend` and `labelStable`. Confirm `linkedWhyNowClaimCount` equals `whyNowClaimCount`; if not, the explanation lacks evidence.
- Event links: set `correctLink`.
- Searches: correct `expectedResultIds` when the generated expectation is incomplete.

Use `reviewerNote` for a short reason when a label is false. Do not move or commit the review file.

## 3. Run authenticated production benchmarks

Copy the complete authenticated `Cookie` request header for `crashboard.dev` into the shell environment. Do not paste it into a command argument, file, issue, or commit.

```bash
export INTELLIGENCE_EVALUATION_COOKIE='<authenticated Cookie header>'
npm run intelligence:v2-evaluate -- benchmark --base-url https://crashboard.dev
unset INTELLIGENCE_EVALUATION_COOKIE
```

The benchmark runs one one-year chart request containing five comparison series and all 20 retained searches. The cookie is used only as an HTTP header and is never saved.

## 4. Calculate the acceptance report

```bash
npm run intelligence:v2-evaluate -- report
```

The command writes private JSON and Markdown reports under `.local/intelligence-evaluation/`. The aggregate report contains no source content or account identifiers. It calculates:

- Duplicate precision and recall.
- Segmentation acceptance.
- False-trend rate.
- Event-to-topic link precision.
- Search recall@10.
- Topic-label stability between refreshes.
- Why-now evidence-link completeness.
- Median, p95, and maximum chart and search response time.

Approval requires all fixed samples to be reviewed, duplicate precision of at least 90%, duplicate recall of at least 80%, false-trend rate below 10%, search recall@10 of at least 80%, 100% evidence-link completeness, and every retained chart/search request below 1.5 seconds. Topic-label stability is reported without inventing an unapproved pass threshold.
