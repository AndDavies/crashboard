#!/usr/bin/env bash
# Apply Site URL + redirect allow list for Crashboard auth (reset, magic link, OAuth).
# Requires: curl, jq. Token: https://supabase.com/dashboard/account/tokens
# Docs: docs/supabase-auth-callbacks.md

set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-nhahhggzdlrejdoftbgb}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SITE_URL="${AUTH_SITE_URL:-http://localhost:3000}"
EXTRA="${AUTH_EXTRA_REDIRECT_URLS:-}"

if [[ -z "$TOKEN" ]]; then
  echo "Set SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access tokens)." >&2
  exit 1
fi

# Trim trailing slash on SITE_URL for consistent joins
BASE="${SITE_URL%/}"
REQUIRED="${BASE}/auth/callback,${BASE}/**"

if [[ -n "$EXTRA" ]]; then
  MERGED="${REQUIRED},${EXTRA}"
else
  MERGED="$REQUIRED"
fi

API="https://api.supabase.com/v1/projects/${REF}/config/auth"

echo "Fetching current auth config…"
CURRENT=$(curl -sS -H "Authorization: Bearer ${TOKEN}" "$API")

if ! echo "$CURRENT" | jq -e . >/dev/null 2>&1; then
  echo "Management API did not return JSON. Check SUPABASE_ACCESS_TOKEN and project ref." >&2
  echo "$CURRENT" >&2
  exit 1
fi

EXISTING=$(echo "$CURRENT" | jq -r '.uri_allow_list // empty')
if [[ -n "$EXISTING" ]]; then
  MERGED="${EXISTING},${MERGED}"
fi

# De-dupe comma-separated entries (preserve order)
MERGED=$(echo "$MERGED" | tr ',' '\n' | awk 'NF {print}' | awk '!seen[$0]++' | paste -sd, -)

BODY=$(jq -nc \
  --arg su "$BASE" \
  --arg ur "$MERGED" \
  '{site_url: $su, uri_allow_list: $ur}')

echo "PATCH ${API}"
echo "  site_url: ${BASE}"
echo "  uri_allow_list: ${MERGED}"

curl -sS -X PATCH "$API" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" | jq .

echo "Done. Confirm under Authentication → URL Configuration in the dashboard."
