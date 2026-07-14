#!/bin/zsh
set -eu

PROJECT="/Users/andrewdavies/Projects/Crashboard"
LOG_DIR="$PROJECT/.intelligence-worker/logs"

mkdir -p "$LOG_DIR"

if ! TURSO_DATABASE_URL="$(/usr/bin/security find-generic-password -a crashboard-intelligence -s dev.crashboard.intelligence.turso-url -w 2>/dev/null)"; then
  print -r -- "$(date -u +%FT%TZ) skipped: Turso URL is not available in macOS Keychain" >> "$LOG_DIR/scheduler.log"
  exit 0
fi

if ! TURSO_AUTH_TOKEN="$(/usr/bin/security find-generic-password -a crashboard-intelligence -s dev.crashboard.intelligence.turso-token -w 2>/dev/null)"; then
  print -r -- "$(date -u +%FT%TZ) skipped: Turso token is not available in macOS Keychain" >> "$LOG_DIR/scheduler.log"
  exit 0
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export TURSO_DATABASE_URL TURSO_AUTH_TOKEN
export INTELLIGENCE_STORE="turso"
export INTELLIGENCE_AGENT_API_FALLBACK_ENABLED="false"
unset OPENAI_API_KEY CODEX_API_KEY

cd "$PROJECT"
exec /opt/homebrew/bin/codex exec \
  --sandbox workspace-write \
  -C "$PROJECT" \
  -o "$LOG_DIR/last-run.md" \
  'Use $crashboard-intelligence-worker. Run the daily Intelligence refresh if one is due. Resume the saved checkpoint, process bounded batches, validate the result, publish only when validation passes, and send the morning brief after a successful publication. If no refresh is due, report a no-op.'
