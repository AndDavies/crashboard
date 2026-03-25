# Database schema companion (Supabase MCP)

Generated: **2026-03-25T18:41:31.615Z** · Project: **crashboard** (`nhahhggzdlrejdoftbgb`) · Source: `list_tables(verbose)` + SQL (`pg_enum`, `pg_policies`).

## Executive summary

- **Public (application)** — This snapshot includes **5** tables in `public`. PKB **v2** lives in `documents`, `document_captures`, `tags`, `document_tags`, `document_links`.
- **Legacy Phase 1** — No `sources` / `source_contents` tables in this snapshot; **public enums** in `pg_enum` may be left over from an older migration or reserved for future use.
- **Supabase-managed** — `auth.*`, `storage.*`, `realtime.*`, `vault.*` follow platform conventions; treat as infrastructure.
- **RLS (`public`)** — `pg_policies` returned **no rows** for `public` in this pass; typical apps rely on **service role** for ingestion and add policies when exposing data to `authenticated` / `anon`.

## Key tables (by schema)

### `public`

| Table | RLS | ~rows | Notes |
|-------|-----|------:|-------|
| `document_captures` | off | 5 | PKB v2 — capture / provenance (Telegram, etc.) |
| `document_links` | off | 1 | PKB v2 — fanout / related URLs (optional `to_document_id`) |
| `document_tags` | off | 5 | PKB v2 — document ↔ tag with source + confidence |
| `documents` | off | 5 | PKB v2 — canonical saved item / extracted content |
| `tags` | off | 4 | PKB v2 — normalized tag catalog |

### `auth`

| Table | RLS | ~rows | Notes |
|-------|-----|------:|-------|
| `audit_log_entries` | on | 0 | Auth: Audit trail for user actions. |
| `custom_oauth_providers` | off | 0 | — |
| `flow_state` | on | 5 | Stores metadata for all OAuth/SSO login flows |
| `identities` | on | 1 | Auth: Stores identities associated to a user. |
| `instances` | on | 0 | Auth: Manages users across multiple sites. |
| `mfa_amr_claims` | on | 8 | auth: stores authenticator method reference claims for multi factor authentication |
| `mfa_challenges` | on | 0 | auth: stores metadata about challenge requests made |
| `mfa_factors` | on | 0 | auth: stores metadata about factors |
| `oauth_authorizations` | off | 0 | — |
| `oauth_client_states` | off | 0 | Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client. |
| `oauth_clients` | off | 0 | — |
| `oauth_consents` | off | 0 | — |
| `one_time_tokens` | on | 0 | — |
| `refresh_tokens` | on | 27 | Auth: Store of tokens used to refresh JWT tokens once they expire. |
| `saml_providers` | on | 0 | Auth: Manages SAML Identity Provider connections. |
| `saml_relay_states` | on | 0 | Auth: Contains SAML Relay State information for each Service Provider initiated login. |
| `schema_migrations` | on | 76 | Auth: Manages updates to the auth system. |
| `sessions` | on | 8 | Auth: Stores session data associated to a user. |
| `sso_domains` | on | 0 | Auth: Manages SSO email address domain mapping to an SSO Identity Provider. |
| `sso_providers` | on | 0 | Auth: Manages SSO identity provider information; see saml_providers for SAML. |
| `users` | on | 1 | Auth: Stores user login data within a secure schema. |
| `webauthn_challenges` | off | 0 | — |
| `webauthn_credentials` | off | 0 | — |

### `storage`

| Table | RLS | ~rows | Notes |
|-------|-----|------:|-------|
| `buckets` | on | 0 | — |
| `buckets_analytics` | on | 0 | — |
| `buckets_vectors` | on | 0 | — |
| `migrations` | on | 57 | — |
| `objects` | on | 0 | — |
| `s3_multipart_uploads` | on | 0 | — |
| `s3_multipart_uploads_parts` | on | 0 | — |
| `vector_indexes` | on | 0 | — |

### `realtime`

| Table | RLS | ~rows | Notes |
|-------|-----|------:|-------|
| `messages` | on | 0 | — |
| `schema_migrations` | off | 68 | — |
| `subscription` | off | 0 | — |

### `vault`

| Table | RLS | ~rows | Notes |
|-------|-----|------:|-------|
| `secrets` | off | 0 | Table with encrypted `secret` column for storing sensitive information on disk. |

## Important columns (curated — PKB `public`)

### `public.documents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | updatable · **PK** · default `gen_random_uuid()` |
| `source_type` | text | updatable · CHECK `source_type = ANY (ARRAY['article'::text, 'pdf'::text, 'youtube_video'::text, 'x_post'::text, 'document'::text, 'unknown'::text])` |
| `original_url` | text | updatable · CHECK `btrim(original_url) <> ''::text` |
| `canonical_url` | text | nullable, updatable |
| `url_host` | text | nullable, updatable |
| `external_id` | text | nullable, updatable · CHECK `external_id IS NULL OR btrim(external_id) <> ''::text` |
| `title` | text | nullable, updatable |
| `author_name` | text | nullable, updatable |
| `publisher_name` | text | nullable, updatable |
| `language` | text | nullable, updatable |
| `published_at` | timestamptz | nullable, updatable |
| `content_text` | text | nullable, updatable |
| `content_markdown` | text | nullable, updatable |
| `transcript_text` | text | nullable, updatable |
| `summary_short` | text | nullable, updatable |
| `summary_medium` | text | nullable, updatable |
| `review_status` | text | updatable · default `'inbox'::text` · CHECK `review_status = ANY (ARRAY['inbox'::text, 'reviewed'::text, 'archived'::text, 'failed'::text])` |
| `ingestion_status` | text | updatable · default `'pending'::text` · CHECK `ingestion_status = ANY (ARRAY['pending'::text, 'ready'::text, 'partial'::text, 'failed'::text])` |
| `extraction_method` | text | nullable, updatable |
| `extraction_version` | text | nullable, updatable |
| `content_hash` | text | nullable, updatable |
| `canonical_key` | text | nullable, updatable · CHECK `canonical_key IS NULL OR btrim(canonical_key) <> ''::text` |
| `metadata` | jsonb | updatable · default `'{}'::jsonb` |
| `quality_flags` | jsonb | updatable · default `'{}'::jsonb` |
| `captured_at` | timestamptz | nullable, updatable |
| `created_at` | timestamptz | updatable · default `now()` |
| `updated_at` | timestamptz | updatable · default `now()` |
| `search_document` | tsvector | nullable, updatable |

### `public.document_captures`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | updatable · **PK** · default `gen_random_uuid()` |
| `document_id` | uuid | updatable |
| `capture_source` | text | updatable · CHECK `capture_source = ANY (ARRAY['telegram'::text, 'import'::text, 'manual'::text, 'api'::text])` |
| `chat_id` | text | nullable, updatable |
| `message_id` | text | nullable, updatable |
| `thread_id` | text | nullable, updatable |
| `sender_id` | text | nullable, updatable |
| `sender_label` | text | nullable, updatable |
| `raw_text` | text | nullable, updatable |
| `captured_at` | timestamptz | updatable · default `now()` |
| `metadata` | jsonb | updatable · default `'{}'::jsonb` |
| `created_at` | timestamptz | updatable · default `now()` |

### `public.tags`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | updatable · **PK** · default `gen_random_uuid()` |
| `tag` | text | updatable · CHECK `btrim(tag) <> ''::text` |
| `tag_normalized` | text | updatable · CHECK `btrim(tag_normalized) <> ''::text` |
| `tag_type` | text | updatable · CHECK `tag_type = ANY (ARRAY['user_hashtag'::text, 'leroy_keyword'::text, 'topic'::text, 'project'::text, 'entity_hint'::text])` |
| `created_at` | timestamptz | updatable · default `now()` |
| `updated_at` | timestamptz | updatable · default `now()` |

### `public.document_tags`

Composite primary key: (`document_id`, `tag_id`, `source`).

| Column | Type | Notes |
|--------|------|-------|
| `document_id` | uuid | updatable · **PK (composite)** |
| `tag_id` | uuid | updatable · **PK (composite)** |
| `source` | text | updatable · **PK (composite)** · CHECK `source = ANY (ARRAY['telegram_hashtag'::text, 'leroy'::text, 'manual'::text])` |
| `confidence` | numeric | nullable, updatable · CHECK `confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric` |
| `metadata` | jsonb | updatable · default `'{}'::jsonb` |
| `created_at` | timestamptz | updatable · default `now()` |
| `updated_at` | timestamptz | updatable · default `now()` |

### `public.document_links`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | updatable · **PK** · default `gen_random_uuid()` |
| `from_document_id` | uuid | updatable |
| `to_document_id` | uuid | nullable, updatable |
| `relation` | text | updatable · CHECK `relation = ANY (ARRAY['linked_article'::text, 'duplicate_of'::text, 'canonical_of'::text, 'mentioned_in'::text])` |
| `url` | text | nullable, updatable |
| `metadata` | jsonb | updatable · default `'{}'::jsonb` |
| `created_at` | timestamptz | updatable · default `now()` |
| `updated_at` | timestamptz | updatable · default `now()` |

## Relationships (foreign keys)

Direction: **child → parent** (FK on child references parent). **Each constraint is listed once** (MCP may duplicate per-table).

### Public

- `public.document_captures.document_id` → `public.documents.id` (`document_captures_document_id_fkey`)
- `public.document_links.from_document_id` → `public.documents.id` (`document_links_from_document_id_fkey`)
- `public.document_links.to_document_id` → `public.documents.id` (`document_links_to_document_id_fkey`)
- `public.document_tags.document_id` → `public.documents.id` (`document_tags_document_id_fkey`)
- `public.document_tags.tag_id` → `public.tags.id` (`document_tags_tag_id_fkey`)

### All schemas

- `auth.identities.user_id` → `auth.users.id` (`identities_user_id_fkey`)
- `auth.mfa_amr_claims.session_id` → `auth.sessions.id` (`mfa_amr_claims_session_id_fkey`)
- `auth.mfa_challenges.factor_id` → `auth.mfa_factors.id` (`mfa_challenges_auth_factor_id_fkey`)
- `auth.mfa_factors.user_id` → `auth.users.id` (`mfa_factors_user_id_fkey`)
- `auth.oauth_authorizations.client_id` → `auth.oauth_clients.id` (`oauth_authorizations_client_id_fkey`)
- `auth.oauth_authorizations.user_id` → `auth.users.id` (`oauth_authorizations_user_id_fkey`)
- `auth.oauth_consents.client_id` → `auth.oauth_clients.id` (`oauth_consents_client_id_fkey`)
- `auth.oauth_consents.user_id` → `auth.users.id` (`oauth_consents_user_id_fkey`)
- `auth.one_time_tokens.user_id` → `auth.users.id` (`one_time_tokens_user_id_fkey`)
- `auth.refresh_tokens.session_id` → `auth.sessions.id` (`refresh_tokens_session_id_fkey`)
- `auth.saml_providers.sso_provider_id` → `auth.sso_providers.id` (`saml_providers_sso_provider_id_fkey`)
- `auth.saml_relay_states.flow_state_id` → `auth.flow_state.id` (`saml_relay_states_flow_state_id_fkey`)
- `auth.saml_relay_states.sso_provider_id` → `auth.sso_providers.id` (`saml_relay_states_sso_provider_id_fkey`)
- `auth.sessions.oauth_client_id` → `auth.oauth_clients.id` (`sessions_oauth_client_id_fkey`)
- `auth.sessions.user_id` → `auth.users.id` (`sessions_user_id_fkey`)
- `auth.sso_domains.sso_provider_id` → `auth.sso_providers.id` (`sso_domains_sso_provider_id_fkey`)
- `auth.webauthn_challenges.user_id` → `auth.users.id` (`webauthn_challenges_user_id_fkey`)
- `auth.webauthn_credentials.user_id` → `auth.users.id` (`webauthn_credentials_user_id_fkey`)
- `public.document_captures.document_id` → `public.documents.id` (`document_captures_document_id_fkey`)
- `public.document_links.from_document_id` → `public.documents.id` (`document_links_from_document_id_fkey`)
- `public.document_links.to_document_id` → `public.documents.id` (`document_links_to_document_id_fkey`)
- `public.document_tags.document_id` → `public.documents.id` (`document_tags_document_id_fkey`)
- `public.document_tags.tag_id` → `public.tags.id` (`document_tags_tag_id_fkey`)
- `storage.objects.bucket_id` → `storage.buckets.id` (`objects_bucketId_fkey`)
- `storage.s3_multipart_uploads.bucket_id` → `storage.buckets.id` (`s3_multipart_uploads_bucket_id_fkey`)
- `storage.s3_multipart_uploads_parts.bucket_id` → `storage.buckets.id` (`s3_multipart_uploads_parts_bucket_id_fkey`)
- `storage.s3_multipart_uploads_parts.upload_id` → `storage.s3_multipart_uploads.id` (`s3_multipart_uploads_parts_upload_id_fkey`)
- `storage.vector_indexes.bucket_id` → `storage.buckets_vectors.id` (`vector_indexes_bucket_id_fkey`)

## Enums (`pg_enum`)

| Schema | Enum | Values |
|--------|------|--------|
| `auth` | `aal_level` | aal1, aal2, aal3 |
| `auth` | `code_challenge_method` | s256, plain |
| `auth` | `factor_status` | unverified, verified |
| `auth` | `factor_type` | totp, webauthn, phone |
| `auth` | `oauth_authorization_status` | pending, approved, denied, expired |
| `auth` | `oauth_client_type` | public, confidential |
| `auth` | `oauth_registration_type` | dynamic, manual |
| `auth` | `oauth_response_type` | code |
| `auth` | `one_time_token_type` | confirmation_token, reauthentication_token, recovery_token, email_change_token_new, email_change_token_current, phone_change_token |
| `public` | `artifact_type` | uploaded_pdf, downloaded_pdf, thumbnail, transcript_file, html_snapshot, raw_html, screenshot, attachment, other |
| `public` | `content_kind` | primary, transcript, description, ocr, structured, auxiliary |
| `public` | `ingestion_job_status` | queued, processing, completed, failed, retryable, skipped |
| `public` | `ingestion_provider` | telegram, manual, api, browser, other |
| `public` | `source_status` | draft, pending, ready, failed, archived |
| `public` | `source_type` | article, youtube_video, x_post, x_thread, pdf, note, document, unknown |
| `realtime` | `action` | INSERT, UPDATE, DELETE, TRUNCATE, ERROR |
| `realtime` | `equality_op` | eq, neq, lt, lte, gt, gte, in |
| `storage` | `buckettype` | STANDARD, ANALYTICS, VECTOR |

**PKB v2** uses **`text` + `CHECK`** on several columns (e.g. `documents.source_type`); those are **not** rows in the table above, but behave like enums.

## Caveats

1. **Not a full `pg_dump`** — Indexes, triggers, functions, grants, and some constraint details may be missing; use Studio or SQL for DDL parity.
2. **`list_tables` row counts** are approximate.
3. **Enum drift** — `public` enums may reference tables that are empty or dropped in application code; trust migrations and live `psql` `\d` output over this summary.
4. **`CHECK` truncation** — Long checks are shortened here; open `schema_mcp_snapshot.json` for the full string from MCP.
5. **`realtime.messages`** — Composite PK includes a time column; tooling must respect partition/table definition.
6. **Regenerate** — Re-run MCP + this script after migrations or Supabase upgrades.

## Related files

- Machine-readable catalog: `schema_mcp_snapshot.json` (regenerate when schema changes).
