export const INTELLIGENCE_TURSO_SCHEMA_VERSION = 1;

export const INTELLIGENCE_TURSO_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS intelligence_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_refreshes (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('building','validated','active','failed','superseded')),
    kind TEXT NOT NULL CHECK (kind IN ('daily','backfill','manual','test')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    complete_through TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    validation_json TEXT,
    failure TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_active_refresh (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    refresh_id TEXT NOT NULL REFERENCES intelligence_refreshes(id),
    activated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_documents (
    id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL,
    source_family TEXT NOT NULL,
    title TEXT NOT NULL,
    publisher TEXT,
    author TEXT,
    published_at TEXT,
    canonical_url TEXT,
    content_text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    editorial_tokens INTEGER NOT NULL DEFAULT 0,
    segmentation_confidence REAL,
    parser_version TEXT,
    raw_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS intelligence_documents_published_idx
    ON intelligence_documents(published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS intelligence_documents_source_family_idx
    ON intelligence_documents(source_family, published_at DESC)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS intelligence_documents_fts USING fts5(
    document_id UNINDEXED,
    title,
    content_text,
    source_family,
    tokenize='unicode61 remove_diacritics 2 tokenchars ''-_'''
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_signals (
    refresh_id TEXT NOT NULL REFERENCES intelligence_refreshes(id) ON DELETE CASCADE,
    signal_id TEXT NOT NULL,
    signal_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    direction TEXT NOT NULL,
    evidence_strength TEXT NOT NULL,
    current_reach REAL NOT NULL,
    previous_reach REAL NOT NULL,
    current_items INTEGER NOT NULL,
    source_count INTEGER NOT NULL,
    lens_keys TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (refresh_id, signal_id)
  )`,
  `CREATE INDEX IF NOT EXISTS intelligence_signals_browse_idx
    ON intelligence_signals(refresh_id, kind, direction, current_reach DESC)`,
  `CREATE INDEX IF NOT EXISTS intelligence_signals_key_idx
    ON intelligence_signals(refresh_id, signal_key)`,
  `CREATE TABLE IF NOT EXISTS intelligence_evidence (
    refresh_id TEXT NOT NULL REFERENCES intelligence_refreshes(id) ON DELETE CASCADE,
    signal_id TEXT NOT NULL,
    document_id TEXT NOT NULL REFERENCES intelligence_documents(id),
    rank INTEGER NOT NULL,
    passage TEXT,
    why_matched TEXT,
    PRIMARY KEY (refresh_id, signal_id, document_id)
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_sources (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    external_key TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    cohort TEXT NOT NULL DEFAULT 'measurement',
    config_json TEXT NOT NULL DEFAULT '{}',
    credential_json TEXT,
    checkpoint_json TEXT NOT NULL DEFAULT '{}',
    last_success_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_id, source_type, external_key)
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_jobs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    job_type TEXT NOT NULL CHECK (job_type IN ('daily_refresh','backfill','research','topic_maintenance','collect')),
    status TEXT NOT NULL CHECK (status IN ('pending','leased','completed','failed','cancelled')),
    priority INTEGER NOT NULL DEFAULT 100,
    payload_json TEXT NOT NULL DEFAULT '{}',
    checkpoint_json TEXT NOT NULL DEFAULT '{}',
    lease_owner TEXT,
    lease_expires_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    failure TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS intelligence_jobs_queue_idx
    ON intelligence_jobs(status, available_at, priority, created_at)`,
  `CREATE TABLE IF NOT EXISTS intelligence_runs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    job_id TEXT,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','completed','failed','no_op')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    report_json TEXT NOT NULL DEFAULT '{}',
    failure TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS intelligence_work_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES intelligence_jobs(id) ON DELETE CASCADE,
    document_id TEXT,
    work_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','prepared','completed','failed','review')),
    input_json TEXT NOT NULL,
    output_json TEXT,
    schema_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    failure TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS intelligence_work_items_job_idx
    ON intelligence_work_items(job_id, status, work_type)`,
  `CREATE TABLE IF NOT EXISTS intelligence_research_requests (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    signal_id TEXT NOT NULL,
    signal_label TEXT NOT NULL,
    question TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending','leased','completed','failed')),
    requested_at TEXT NOT NULL,
    completed_at TEXT,
    result_json TEXT,
    failure TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS intelligence_research_queue_idx
    ON intelligence_research_requests(status, requested_at)`,
];
