# Intelligence v2 retained evaluation

This is the production-acceptance workflow for Intelligence v2. The retained
review set stays under `.local/intelligence-evaluation/` because it contains
private newsletter titles, excerpts, search queries, and source URLs. Git
ignores that directory, and every evaluator command refuses to write elsewhere.

`init`, `refresh`, `quality`, and `report` are zero-OpenAI-Platform-API local
work. The evaluator and local signal-refresh runner remove both
`OPENAI_API_KEY` and `CODEX_API_KEY` from their processes before work starts.
The only Platform-API-bearing evaluation step is `benchmark`: its 20 production
searches may create one small query embedding each on the deployed server. This
workflow does not create missing content embeddings, run research, or call a
model for classification.

The acceptance sequence has three different data roles:

1. One completed backfill creates the retained baseline review set.
2. Six fixed-window validation refreshes recalculate the same data. Record each
   refresh immediately. The runner stores compact full-series and topic-label
   fingerprints plus counts in its completed checkpoint, then prunes that
   non-promoted validation generation before the next clone. The evaluator
   records those compact checkpoints without retaining six extra copies of the
   canonical daily rows.
3. One normal current-window refresh proves the deployed dashboard is using
   current, structurally valid data before the production benchmark.

Do not add `--require-current-window` during the six fixed-window validations.
That flag is used only after all six have been recorded.

## 1. Create the baseline

Run from the Crashboard repository. Use the exact completed backfill run ID and
its exact complete-through date; do not substitute the latest date.

```bash
npm run intelligence:v2-evaluate -- init \
  --owner <dashboard-user-id> \
  --run-id <completed-backfill-run-id> \
  --complete-through <backfill-complete-through>
```

For the July 2026 acceptance run, the exact command is:

```bash
npm run intelligence:v2-evaluate -- init \
  --owner 5ff5c69e-5cb3-488a-a7ed-13067c50e85b \
  --run-id b63b6ddc-d999-4def-86b3-b5af24e407f3 \
  --complete-through 2026-07-12
```

Use `--replace` only when deliberately discarding an existing retained review
workspace. A normal continuation uses `refresh`, not `init --replace`.

The baseline contains exactly:

- 100 independently selected story-duplicate pairs.
- 100 independently selected event-duplicate pairs.
- 50 stratified newsletter segmentation examples.
- 30 high-ranked Topic or Keyword movements.
- 50 event-to-topic links stratified by event type and confidence.
- 20 searches: exactly four acronyms, four systems, four organizations, four
  topics, and four natural-language questions.

## 2. Record six fixed-window validation refreshes

Run one target at a time. After each signal-refresh command completes, record
that exact completed run before starting the next target. `refresh` verifies
the checkpoint's pinned window, metric, refresh ID, and dedup generations; it
does not require the pruned validation rows to remain in the canonical table.
The compact checkpoint must use fingerprint contract
`signal-fingerprint-v2.0.0`; mixed fingerprint versions never pass stability.

```bash
npm run intelligence:v2-signal-refresh -- \
  --owner <dashboard-user-id> \
  --target 1

npm run intelligence:v2-evaluate -- refresh \
  --owner <dashboard-user-id> \
  --run-id <completed-fixed-window-run-id-1> \
  --complete-through <backfill-complete-through>
```

Repeat that pair with `--target 2` through `--target 6`, passing the completed
run ID printed by each refresh into the matching evaluator command. For the July
2026 baseline, the deterministic fixed-window run IDs are:

| Target | Completed run ID |
|---:|---|
| 1 | `30cb6005-2d7f-5ec9-a49e-7b78dc5b596b` |
| 2 | `f086eb3b-5123-53a8-8a30-d762b25abaee` |
| 3 | `f08177e1-a1e3-5200-8905-ed36abb73ef6` |
| 4 | `bd0b7c0e-bc7f-55bd-9d23-b3fd25a2761f` |
| 5 | `23d33b68-30ff-53d0-9568-5acb179f85c9` |
| 6 | `bd68d41a-cef6-53a5-aefc-6fb8eeb60a62` |

For example, target 1 is recorded with:

```bash
npm run intelligence:v2-evaluate -- refresh \
  --owner 5ff5c69e-5cb3-488a-a7ed-13067c50e85b \
  --run-id 30cb6005-2d7f-5ec9-a49e-7b78dc5b596b \
  --complete-through 2026-07-12
```

At the end, `review.json` must contain seven unique validation snapshots: the
backfill baseline plus six fixed-window refreshes. All seven must use the same
window and metric version, and every topic-label fingerprint must match.

## 3. Review the retained set

Edit only reviewer fields in
`.local/intelligence-evaluation/review.json`:

- Story duplicate pairs: set every `sameStory` to `true` or `false`.
- Event duplicate pairs: set every `sameEvent` to `true` or `false`.
- Segmentations: set `acceptable`, `correctEditorialItemCount`, and
  `containsTrendEligibleBoilerplate` on all 50 examples. A parse passes only
  when its eligible editorial-item count is correct and no trend-eligible
  boilerplate remains.
- Surges: set both `isRealTrend` and `directionCorrect` on all 30 examples.
  Open the listed evidence and set `linkedWhyNowClaimCount` to the number of
  actual claims it supports. Approval requires that number to equal
  `whyNowClaimCount` for every surge.
- Event links: set every `correctLink`.
- Searches: independently correct `expectedResultIds`, then set
  `relevanceReviewed` to `true` for all 20 searches. Generated IDs are only a
  starting point; unreviewed expectations never count toward recall.

Topic `labelStable` values are calculated by `refresh`; do not edit them.

### Use Codex with on-device Ollama for the large review passes

The repeatable reviewer runs the bundled Codex CLI as the agent and the
installed `qwen3.5:27b` Ollama layers as the model. In this mode both inference
and retained evidence stay on this Mac: it consumes neither OpenAI Platform API
credits nor ChatGPT/Codex plan quota. On the current 24 GB M4 machine it is
materially slower than hosted Codex, so the runner selects only unresolved
items and processes a bounded batch at a time.

Create the local `qwen3.5-codex:27b` alias once. Setup is idempotent and refuses
to download a missing source model:

```bash
npm run intelligence:v2-local-review -- --setup
```

Run one section repeatedly until the command reports it complete:

```bash
npm run intelligence:v2-local-review -- --section story-duplicates
npm run intelligence:v2-local-review -- --section event-duplicates
npm run intelligence:v2-local-review -- --section segmentations
npm run intelligence:v2-local-review -- --section event-topic-links
```

For an unattended large pass, add `--all-pending`. The command commits one
validated batch at a time and stops safely on an error or oversized item:

```bash
npm run intelligence:v2-local-review -- \
  --section story-duplicates \
  --all-pending
```

A `null` decision with a reviewer note is not sent to the model repeatedly; it
remains visibly unresolved for manual review.

Story, event, and event-topic batches default to ten unresolved examples.
Segmentation always runs one complete source at a time; its middle is never
truncated because that would invalidate the editorial-item count. Use
`--limit 1` through `--limit 20` for the other sections. Every run:

- removes `OPENAI_API_KEY` and `CODEX_API_KEY` from the child process;
- creates a fresh temporary `CODEX_HOME`, ignores user configuration, disables
  web search, analytics, feedback, and telemetry export, and explicitly selects
  loopback-only local Ollama;
- gives the model read-only access to blinded evidence that excludes generated
  predictions and confidence values;
- requires structured output and independently validates it even if the model
  reports success; and
- holds an exclusive lock, verifies the original file hash, then atomically
  merges only the documented reviewer fields on the exact selected IDs.

The surge evidence-link review, search expectation review, and post-benchmark
visible Why-now review still require linked or authenticated production
evidence. The on-device reviewer intentionally does not infer those answers
from the retained text.

### Hosted Codex fallback through the saved ChatGPT login

Codex can perform a first-pass review of the retained local evidence without
creating OpenAI Platform API charges. This is Codex running from this Mac with
Andrew's saved ChatGPT login; the model is not running on-device, and the work
still counts against the applicable ChatGPT/Codex usage limits. Any retained
excerpts Codex reads are processed under the active ChatGPT workspace's data
handling and retention controls; “local” describes where the CLI and files run,
not where model inference occurs.

Use only the ChatGPT-bundled binary. First verify the binary and authentication
method. The second command must print `Logged in using ChatGPT`; stop if it
reports API-key authentication.

```bash
CODEX_BIN="/Applications/ChatGPT.app/Contents/Resources/codex"

"$CODEX_BIN" --version
env -u OPENAI_API_KEY -u CODEX_API_KEY "$CODEX_BIN" login status
```

Run one review section at a time so each pass has a bounded evidence set. This
example reviews story duplicates. It removes both possible usage-billed keys,
loads saved ChatGPT authentication, disables persistent rollout files, and
confines write access to the ignored private evaluation directory.

```bash
EVAL_DIR="$PWD/.local/intelligence-evaluation"

env -u OPENAI_API_KEY -u CODEX_API_KEY "$CODEX_BIN" exec \
  --ephemeral \
  --sandbox workspace-write \
  --ignore-user-config \
  --ignore-rules \
  --skip-git-repo-check \
  -C "$EVAL_DIR" \
  'Review only duplicatePairs in review.json. Decide whether each pair describes the same underlying story from its retained local evidence. Edit only sameStory and reviewerNote inside duplicatePairs. Do not change IDs, evidence, generated fields, another section, or another file. Leave sameStory null when the retained evidence is insufficient, and explain why in reviewerNote. Before finishing, parse review.json as JSON and report the reviewed and unresolved counts.'

jq empty "$EVAL_DIR/review.json"
jq '[.duplicatePairs[] | select(.sameStory == null)] | length' "$EVAL_DIR/review.json"
```

If using hosted Codex instead, repeat with these bounded substitutions; never
ask one Codex run to review the entire file:

| Section | Allowed reviewer fields |
|---|---|
| `eventDuplicatePairs` | `sameEvent`, `reviewerNote` |
| `segmentationExamples` | `acceptable`, `correctEditorialItemCount`, `containsTrendEligibleBoilerplate`, `reviewerNote` |
| `eventTopicLinks` | `correctLink`, `reviewerNote` |

The surge evidence-link review, search expectation review, and post-benchmark
visible Why-now review are not safe to complete from the retained local text
alone. They require the linked evidence or authenticated production results.
Codex may assist while those sources are open, but it must not fill those fields
by inference. Any unresolved `null` remains a required manual review item.

## 4. Run the current-window quality snapshot

After all six fixed-window validations are recorded, run exactly one normal
current-window refresh:

```bash
npm run intelligence:v2-signal-refresh -- \
  --owner <dashboard-user-id> \
  --target 6 \
  --require-current-window
```

Then record the structured data-quality snapshot using the completed current
run ID and the complete-through date printed by the runner:

```bash
npm run intelligence:v2-evaluate -- quality \
  --owner <dashboard-user-id> \
  --run-id <completed-current-window-run-id> \
  --complete-through <current-complete-through>
```

For the current July 2026 acceptance window, that command is:

```bash
npm run intelligence:v2-evaluate -- quality \
  --owner 5ff5c69e-5cb3-488a-a7ed-13067c50e85b \
  --run-id 8c2249bb-febd-5434-9fa3-e94d039af759 \
  --complete-through 2026-07-13
```

The quality command calls one service-role-only, read-only database function.
It is pinned to the exact refresh, metric, window, story generation, and event
generation. A dedicated index supplies the refresh rows, and the function has a
60-second database timeout because it must inspect the complete accepted
series. It records nine gates:

- At least 95% measurement-item coverage.
- 100% normalized source-family coverage.
- Complete newsletter parser-v2 rebuild.
- Zero excluded segments contributing v2 artifacts.
- At least 90% event-link coverage.
- Zero future events referenced as visible actions.
- Valid canonical series using the exact active dedup generations.
- One consistent item/token denominator per day.
- Zero ineligible research, inactive-source, or pre-promotion documents
  affecting a score.

Any false or omitted gate blocks approval.

## 5. Benchmark the Ready production deployment

Deploy the exact commit being accepted and wait for Vercel to report **Ready**.
Copy the complete authenticated `Cookie` request header for `crashboard.dev`
into the environment. Never paste it into a command argument, file, issue, or
commit.

```bash
export INTELLIGENCE_EVALUATION_COOKIE='<authenticated Cookie header>'

npm run intelligence:v2-evaluate -- benchmark \
  --base-url https://crashboard.dev \
  --deployment-commit <ready-production-commit-sha>

unset INTELLIGENCE_EVALUATION_COOKIE
```

The benchmark refuses to run until all 20 expected-search sets are reviewed and
the current quality snapshot exists. It measures exactly one five-series `365d`
chart request and exactly 20 non-empty ranked searches. Until the corpus itself
contains a full year, each comparison must return at least 12 ordered, populated
weekly points and end within 14 days of the accepted window; the gate does not
invent missing history. Any HTTP failure, empty search, incomplete chart, stale
complete-through date, or changed review fingerprint invalidates the benchmark.

The benchmark also captures every visible **Why now** statement returned by the
unfiltered Overview/Explore response. Afterwards, open every listed evidence
URL and set `supportedByLinkedEvidence` on every `visibleWhyNowClaims` item.

## 6. Generate the acceptance report

```bash
npm run intelligence:v2-evaluate -- report
```

The private JSON and Markdown reports are written under
`.local/intelligence-evaluation/`; the aggregate report contains no source
content or account identifiers. Approval remains false unless all fixed sample
counts and reviews are complete and every gate passes, including:

- Story and event duplicate precision at least 90% and recall at least 80%.
- Segmentation acceptance and event-to-topic precision at least 90%.
- False-trend rate below 10%, including wrong movement direction.
- Search recall@10 at least 80%.
- 100% topic-label stability and linked Why-now evidence.
- Seven fixed-window validation snapshots.
- All nine current data-quality gates.
- Exactly one successful five-series `365d` chart request with at least 12
  available weekly points and 20 successful non-empty search requests, each
  under 1.5 seconds.
- A benchmark fingerprint and complete-through date that still match the
  accepted workspace and Ready deployment.
