#!/bin/zsh
set -eu

PROJECT="/Users/andrewdavies/Projects/Crashboard"
PAGE_LIMIT="${1:-5}"
BATCH_SIZE="${2:-100}"

if ! [[ "$PAGE_LIMIT" =~ '^[0-9]+$' ]] || (( PAGE_LIMIT < 1 || PAGE_LIMIT > 25 )); then
  print -u2 -- "Page limit must be between 1 and 25."
  exit 2
fi
if ! [[ "$BATCH_SIZE" =~ '^[0-9]+$' ]] || (( BATCH_SIZE < 1 || BATCH_SIZE > 100 )); then
  print -u2 -- "Batch size must be between 1 and 100."
  exit 2
fi

cd "$PROJECT"
export INTELLIGENCE_STORE="turso"
export INTELLIGENCE_AGENT_API_FALLBACK_ENABLED="false"
unset OPENAI_API_KEY CODEX_API_KEY

for page in $(seq 1 "$PAGE_LIMIT"); do
  result="$(NODE_OPTIONS=--conditions=react-server node --import tsx \
    scripts/intelligence-agent-worker.ts collect-gmail \
    --mode backfill --batch "$BATCH_SIZE")"
  print -r -- "$result"
  if [[ "$result" == *'"hasMore": false'* ]]; then
    print -r -- "Backfill complete after page $page of this run."
    exit 0
  fi
done

print -r -- "Saved the checkpoint after $PAGE_LIMIT pages; run again to continue."
