import "server-only";

import { createClient, type Client, type InStatement, type Row } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { INTELLIGENCE_TURSO_SCHEMA, INTELLIGENCE_TURSO_SCHEMA_VERSION } from "./schema";
import type {
  IntelligenceBrowseOptions,
  IntelligenceDocumentSearchResult,
  IntelligenceJob,
  IntelligenceRefreshKind,
  IntelligenceResearchRequest,
  IntelligenceResearchResult,
  IntelligenceSourceConnection,
  IntelligenceStore,
  IntelligenceStoredDocument,
  IntelligenceValidation,
} from "./types";
import type {
  IntelligenceSignalSeriesPoint,
  IntelligenceSignalSummary,
  IntelligenceSignalsResponse,
} from "@/lib/intelligence/signals-v2-types";
import { auditSignalLabels, normalizeSignalText } from "@/lib/intelligence/agent-worker/signal-language";

const DAY_MS = 86_400_000;

function nowIso() {
  return new Date().toISOString();
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function nullableText(value: unknown) {
  return value == null ? null : String(value);
}

function number(value: unknown) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}

function rangeDays(range: IntelligenceBrowseOptions["range"]) {
  return range === "30d" ? 30 : range === "180d" ? 180 : range === "365d" ? 365 : 90;
}

function trimSeries(series: IntelligenceSignalSeriesPoint[], days: number) {
  if (!series.length) return series;
  const last = Date.parse(`${series.at(-1)!.date}T00:00:00Z`);
  if (!Number.isFinite(last)) return series;
  const cutoff = last - (days - 1) * DAY_MS;
  return series.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= cutoff);
}

/**
 * Turso persists reach as a 0-1 proportion so refresh validation and trend
 * calculations use one consistent unit. The public signals contract uses
 * percentage points because that is what the dashboard and API consumers
 * display (for example, 0.045 is returned as 4.5).
 */
function signalAsPercentage(signal: IntelligenceSignalSummary): IntelligenceSignalSummary {
  return {
    ...signal,
    currentReach: signal.currentReach * 100,
    previousReach: signal.previousReach * 100,
    series: signal.series.map((point) => ({
      ...point,
      shareOfCoverage: point.shareOfCoverage * 100,
    })),
  };
}

function snippet(content: string, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  const index = content.toLocaleLowerCase().indexOf(normalized);
  const start = Math.max(0, index < 0 ? 0 : index - 180);
  const end = Math.min(content.length, start + 520);
  return `${start ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

function storedDocument(row: Row): IntelligenceStoredDocument {
  return {
    id: text(row.id), externalId: text(row.external_id), sourceType: text(row.source_type),
    sourceFamily: text(row.source_family), title: text(row.title), publisher: nullableText(row.publisher),
    author: nullableText(row.author), publishedAt: nullableText(row.published_at),
    canonicalUrl: nullableText(row.canonical_url), contentText: text(row.content_text),
    contentHash: text(row.content_hash), editorialTokens: number(row.editorial_tokens),
    segmentationConfidence: row.segmentation_confidence == null ? null : number(row.segmentation_confidence),
    parserVersion: nullableText(row.parser_version), raw: parseJson(row.raw_json, {}),
  };
}

function researchRequest(row: Row): IntelligenceResearchRequest {
  const storedStatus = text(row.status);
  return {
    id: text(row.id),
    ownerId: text(row.owner_id),
    signalId: text(row.signal_id),
    signalLabel: text(row.signal_label),
    question: nullableText(row.question),
    status: storedStatus === "leased" ? "running" : storedStatus as IntelligenceResearchRequest["status"],
    requestedAt: text(row.requested_at),
    completedAt: nullableText(row.completed_at),
    result: parseJson<IntelligenceResearchResult | null>(row.result_json, null),
    failure: nullableText(row.failure),
  };
}

function signalWithResearch(
  signal: IntelligenceSignalSummary,
  request: IntelligenceResearchRequest | undefined,
): IntelligenceSignalSummary {
  if (!request) return signal;
  const result = request.result;
  const researchEvidence = result?.sources.map((source, index) => ({
    id: `research:${request.id}:${index}`,
    documentId: `research:${request.id}:${index}`,
    title: source.title,
    passage: source.passage,
    url: source.url,
    publisher: source.publisher,
    publishedAt: source.publishedAt,
    sourceFamily: source.publisher,
    authority: source.authority,
    storyId: `research:${source.url}`,
    whyMatched: source.supports,
    isResearch: true,
  })) ?? [];
  return {
    ...signal,
    ...(result ? {
      whyNow: result.whyNow,
      whyItMatters: result.whyItMatters,
      whatToWatch: result.whatToWatch,
      evidence: [...researchEvidence, ...signal.evidence].slice(0, 15),
    } : {}),
    researchStatus: request.status === "pending"
      ? "queued"
      : request.status,
    researchCompletedAt: request.completedAt,
  };
}

export class TursoIntelligenceStore implements IntelligenceStore {
  readonly client: Client;

  constructor(client?: Client) {
    const configuredUrl = process.env.TURSO_DATABASE_URL?.trim();
    if (!client && intelligenceUsesRemoteTurso() && !configuredUrl) {
      throw new Error("TURSO_DATABASE_URL is required when INTELLIGENCE_STORE=turso.");
    }
    const url = configuredUrl || "file:.data/intelligence.db";
    if (!client && url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
    this.client = client ?? createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      concurrency: 10,
    });
  }

  async initialize() {
    for (const sql of INTELLIGENCE_TURSO_SCHEMA) await this.client.execute(sql);
    await this.client.execute({
      sql: `INSERT INTO intelligence_meta(key,value,updated_at) VALUES('schema_version',?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
      args: [String(INTELLIGENCE_TURSO_SCHEMA_VERSION), nowIso()],
    });
  }

  async health() {
    await this.initialize();
    const result = await this.client.execute(
      `SELECT m.value AS schema_version, a.refresh_id, r.completed_at,
        (SELECT count(*) FROM intelligence_jobs WHERE status IN ('pending','leased')) AS pending_jobs,
        EXISTS(SELECT 1 FROM intelligence_sources WHERE source_type='gmail' AND status='active') AS gmail_connected
       FROM intelligence_meta m
       LEFT JOIN intelligence_active_refresh a ON a.singleton=1
       LEFT JOIN intelligence_refreshes r ON r.id=a.refresh_id
       WHERE m.key='schema_version'`,
    );
    const row = result.rows[0];
    const completedAt = nullableText(row?.completed_at);
    return {
      ok: Boolean(row),
      schemaVersion: number(row?.schema_version),
      activeRefreshId: nullableText(row?.refresh_id),
      activeRefreshCompletedAt: completedAt,
      pendingJobs: number(row?.pending_jobs),
      gmailConnected: number(row?.gmail_connected) === 1,
      dailyRefreshDue: !completedAt || Date.now() - Date.parse(completedAt) >= 20 * 60 * 60 * 1_000,
    };
  }

  async beginRefresh(kind: IntelligenceRefreshKind) {
    await this.initialize();
    const id = randomUUID();
    await this.client.execute({
      sql: `INSERT INTO intelligence_refreshes(id,status,kind,started_at) VALUES(?, 'building', ?, ?)`,
      args: [id, kind, nowIso()],
    });
    return id;
  }

  async putDocuments(documents: IntelligenceStoredDocument[]) {
    if (!documents.length) return;
    const time = nowIso();
    const statements: InStatement[] = [];
    for (const document of documents) {
      statements.push({
        sql: `INSERT INTO intelligence_documents(
          id,external_id,source_type,source_family,title,publisher,author,published_at,
          canonical_url,content_text,content_hash,editorial_tokens,segmentation_confidence,
          parser_version,raw_json,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(external_id) DO UPDATE SET
          source_type=excluded.source_type,source_family=excluded.source_family,title=excluded.title,
          publisher=excluded.publisher,author=excluded.author,published_at=excluded.published_at,
          canonical_url=excluded.canonical_url,content_text=excluded.content_text,
          content_hash=excluded.content_hash,editorial_tokens=excluded.editorial_tokens,
          segmentation_confidence=excluded.segmentation_confidence,parser_version=excluded.parser_version,
          raw_json=excluded.raw_json,updated_at=excluded.updated_at`,
        args: [
          document.id, document.externalId, document.sourceType, document.sourceFamily,
          document.title, document.publisher ?? null, document.author ?? null,
          document.publishedAt ?? null, document.canonicalUrl ?? null, document.contentText,
          document.contentHash, document.editorialTokens, document.segmentationConfidence ?? null,
          document.parserVersion ?? null, JSON.stringify(document.raw ?? {}), time, time,
        ],
      });
      statements.push({
        sql: `DELETE FROM intelligence_documents_fts WHERE document_id=?`,
        args: [document.id],
      });
      statements.push({
        sql: `INSERT INTO intelligence_documents_fts(document_id,title,content_text,source_family)
          VALUES(?,?,?,?)`,
        args: [document.id, document.title, document.contentText, document.sourceFamily],
      });
    }
    await this.client.batch(statements, "write");
  }

  async putSignals(refreshId: string, signals: IntelligenceSignalSummary[]) {
    if (!signals.length) return;
    const statements: InStatement[] = [];
    for (const signal of signals) {
      statements.push({
        sql: `INSERT INTO intelligence_signals(
          refresh_id,signal_id,signal_key,kind,label,direction,evidence_strength,current_reach,
          previous_reach,current_items,source_count,lens_keys,payload_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(refresh_id,signal_id) DO UPDATE SET
          signal_key=excluded.signal_key,kind=excluded.kind,label=excluded.label,
          direction=excluded.direction,evidence_strength=excluded.evidence_strength,
          current_reach=excluded.current_reach,previous_reach=excluded.previous_reach,
          current_items=excluded.current_items,source_count=excluded.source_count,
          lens_keys=excluded.lens_keys,payload_json=excluded.payload_json`,
        args: [
          refreshId, signal.id, signal.key, signal.kind, signal.label, signal.direction,
          signal.evidenceStrength, signal.currentReach, signal.previousReach, signal.currentItems,
          signal.sources, JSON.stringify(signal.lensKeys), JSON.stringify(signal),
        ],
      });
      for (const [rank, evidence] of signal.evidence.entries()) {
        if (!evidence.documentId) continue;
        statements.push({
          sql: `INSERT INTO intelligence_evidence(refresh_id,signal_id,document_id,rank,passage,why_matched)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(refresh_id,signal_id,document_id) DO UPDATE SET
              rank=excluded.rank,passage=excluded.passage,why_matched=excluded.why_matched`,
          args: [refreshId, signal.id, evidence.documentId, rank, evidence.passage, evidence.whyMatched],
        });
      }
    }
    await this.client.batch(statements, "write");
  }

  async validateRefresh(refreshId: string): Promise<IntelligenceValidation> {
    const [signalResult, documentResult, evidenceResult, badSignalResult, signalRowsResult, missingEvidenceResult] = await Promise.all([
      this.client.execute({ sql: `SELECT count(*) AS count FROM intelligence_signals WHERE refresh_id=?`, args: [refreshId] }),
      this.client.execute(`SELECT count(*) AS count FROM intelligence_documents`),
      this.client.execute({ sql: `SELECT count(*) AS count FROM intelligence_evidence WHERE refresh_id=?`, args: [refreshId] }),
      this.client.execute({
        sql: `SELECT count(*) AS count FROM intelligence_signals
          WHERE refresh_id=? AND (label='' OR payload_json='' OR current_reach < 0 OR current_reach > 1)`,
        args: [refreshId],
      }),
      this.client.execute({
        sql: `SELECT label,kind FROM intelligence_signals WHERE refresh_id=?`,
        args: [refreshId],
      }),
      this.client.execute({
        sql: `SELECT count(*) AS count FROM intelligence_signals s
          WHERE s.refresh_id=? AND NOT EXISTS (
            SELECT 1 FROM intelligence_evidence e
            WHERE e.refresh_id=s.refresh_id AND e.signal_id=s.signal_id
          )`,
        args: [refreshId],
      }),
    ]);
    const counts = {
      signals: number(signalResult.rows[0]?.count),
      documents: number(documentResult.rows[0]?.count),
      evidenceLinks: number(evidenceResult.rows[0]?.count),
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    const labelRows = signalRowsResult.rows.map((row) => ({
      label: text(row.label),
      kind: text(row.kind) as IntelligenceSignalSummary["kind"],
    }));
    const labelAudit = auditSignalLabels(labelRows);
    const uniqueLabels = new Set(labelRows.map((row) => normalizeSignalText(row.label)));
    if (!counts.signals) errors.push("Refresh contains no signals.");
    if (number(badSignalResult.rows[0]?.count)) errors.push("Refresh contains malformed signal rows.");
    if (labelAudit.blocked.length) {
      errors.push(`Refresh contains blocked generic signal labels: ${labelAudit.blocked.map((row) => row.label).join(", ")}.`);
    }
    if (uniqueLabels.size !== labelRows.length) errors.push("Refresh contains duplicate normalized signal labels.");
    if (number(missingEvidenceResult.rows[0]?.count)) errors.push("Every signal must retain at least one evidence link.");
    if (counts.documents >= 100 && counts.signals >= 10) {
      const representedKinds = Object.values(labelAudit.kindCounts).filter((count) => count > 0).length;
      if (representedKinds < 3) errors.push("Corpus-scale refreshes must contain at least three signal types.");
      if (!labelAudit.kindCounts.topic) errors.push("Corpus-scale refreshes must contain stable topics.");
      if (!(labelAudit.kindCounts.organization || labelAudit.kindCounts.system || labelAudit.kindCounts.programme)) {
        errors.push("Corpus-scale refreshes must contain organizations, systems, or programmes.");
      }
    }
    if (!counts.documents) warnings.push("No retained documents are available for evidence search.");
    if (!counts.evidenceLinks) warnings.push("No signal-to-document evidence links are present.");
    const validation = { ok: errors.length === 0, errors, warnings, counts };
    await this.client.execute({
      sql: `UPDATE intelligence_refreshes SET status=?,validation_json=? WHERE id=? AND status='building'`,
      args: [validation.ok ? "validated" : "failed", JSON.stringify(validation), refreshId],
    });
    return validation;
  }

  async publishRefresh(refreshId: string) {
    const validation = await this.validateRefresh(refreshId);
    if (!validation.ok) throw new Error(`Refresh validation failed: ${validation.errors.join(" ")}`);
    const time = nowIso();
    const latest = await this.client.execute({
      sql: `SELECT max(json_extract(payload_json,'$.series[#-1].date')) AS complete_through
        FROM intelligence_signals WHERE refresh_id=?`,
      args: [refreshId],
    });
    await this.client.batch([
      {
        sql: `UPDATE intelligence_refreshes SET status='superseded'
          WHERE id=(SELECT refresh_id FROM intelligence_active_refresh WHERE singleton=1) AND id<>?`,
        args: [refreshId],
      },
      {
        sql: `UPDATE intelligence_refreshes SET status='active',completed_at=?,complete_through=? WHERE id=?`,
        args: [time, nullableText(latest.rows[0]?.complete_through), refreshId],
      },
      {
        sql: `INSERT INTO intelligence_active_refresh(singleton,refresh_id,activated_at) VALUES(1,?,?)
          ON CONFLICT(singleton) DO UPDATE SET refresh_id=excluded.refresh_id,activated_at=excluded.activated_at`,
        args: [refreshId, time],
      },
    ], "write");
  }

  async failRefresh(refreshId: string, failure: string) {
    await this.client.execute({
      sql: `UPDATE intelligence_refreshes SET status='failed',completed_at=?,failure=? WHERE id=?`,
      args: [nowIso(), failure.slice(0, 4_000), refreshId],
    });
  }

  private async activeRefresh() {
    const result = await this.client.execute(
      `SELECT r.id,r.completed_at,r.complete_through
       FROM intelligence_active_refresh a
       JOIN intelligence_refreshes r ON r.id=a.refresh_id
       WHERE a.singleton=1 AND r.status='active'`,
    );
    return result.rows[0] ?? null;
  }

  async getSignals(options: IntelligenceBrowseOptions = {}): Promise<IntelligenceSignalsResponse> {
    await this.initialize();
    const active = await this.activeRefresh();
    const range = options.range ?? "90d";
    const lens = options.lens ?? "all";
    const kind = options.kind ?? "all";
    if (!active) {
      return {
        generatedAt: nowIso(), completeThrough: "", range, lens, kind,
        total: 0, signals: [], comparison: [], dataStatus: "building",
      };
    }
    const clauses = ["refresh_id=?"];
    const args: Array<string | number> = [text(active.id)];
    if (kind !== "all") { clauses.push("kind=?"); args.push(kind); }
    if (lens !== "all") { clauses.push("EXISTS (SELECT 1 FROM json_each(lens_keys) WHERE value=?)"); args.push(lens); }
    const result = await this.client.execute({
      sql: `SELECT payload_json FROM intelligence_signals WHERE ${clauses.join(" AND ")}
        ORDER BY CASE direction WHEN 'new' THEN 1 WHEN 'rising' THEN 2 WHEN 'sustained' THEN 3 ELSE 4 END,
        current_reach DESC LIMIT ?`,
      args: [...args, Math.max(1, Math.min(options.limit ?? 80, 250))],
    });
    const days = rangeDays(range);
    const rawSignals = result.rows.map((row) => {
      const signal = parseJson<IntelligenceSignalSummary>(row.payload_json, null as never);
      return { ...signal, series: trimSeries(signal.series, days) };
    }).filter(Boolean);
    const compareIds = [...new Set(options.compare ?? [])].slice(0, 5);
    let comparison: IntelligenceSignalSummary[] = [];
    if (compareIds.length) {
      const compared = await this.client.execute({
        sql: `SELECT payload_json FROM intelligence_signals WHERE refresh_id=?
          AND (signal_id IN (${placeholders(compareIds.length)}) OR signal_key IN (${placeholders(compareIds.length)}))`,
        args: [text(active.id), ...compareIds, ...compareIds],
      });
      comparison = compared.rows.map((row) => {
        const signal = parseJson<IntelligenceSignalSummary>(row.payload_json, null as never);
        return { ...signal, series: trimSeries(signal.series, days) };
      }).filter(Boolean);
    }
    const researchBySignal = await this.latestResearchForSignals(
      [...rawSignals, ...comparison].map((signal) => signal.id),
    );
    const signals = rawSignals.map((signal) => signalAsPercentage(
      signalWithResearch(signal, researchBySignal.get(signal.id)),
    ));
    comparison = comparison.map((signal) => signalAsPercentage(
      signalWithResearch(signal, researchBySignal.get(signal.id)),
    ));
    return {
      generatedAt: nullableText(active.completed_at) ?? nowIso(),
      completeThrough: nullableText(active.complete_through) ?? signals[0]?.series.at(-1)?.date ?? "",
      range, lens, kind, total: signals.length, signals, comparison, dataStatus: "ready",
    };
  }

  async getSignal(id: string) {
    const active = await this.activeRefresh();
    if (!active) return null;
    const result = await this.client.execute({
      sql: `SELECT payload_json FROM intelligence_signals
        WHERE refresh_id=? AND (signal_id=? OR signal_key=?) LIMIT 1`,
      args: [text(active.id), id, id],
    });
    if (!result.rows[0]) return null;
    const signal = parseJson<IntelligenceSignalSummary>(result.rows[0].payload_json, null as never);
    const research = (await this.latestResearchForSignals([signal.id])).get(signal.id);
    return signalAsPercentage(signalWithResearch(signal, research));
  }

  private async latestResearchForSignals(signalIds: string[]) {
    const ids = [...new Set(signalIds)].filter(Boolean);
    const latest = new Map<string, IntelligenceResearchRequest>();
    if (!ids.length) return latest;
    const result = await this.client.execute({
      sql: `SELECT * FROM intelligence_research_requests
        WHERE signal_id IN (${placeholders(ids.length)})
        ORDER BY requested_at DESC`,
      args: ids,
    });
    for (const row of result.rows) {
      const request = researchRequest(row);
      if (!latest.has(request.signalId)) latest.set(request.signalId, request);
    }
    return latest;
  }

  async searchDocuments(query: string, limit = 25): Promise<IntelligenceDocumentSearchResult[]> {
    const cleaned = query.trim().slice(0, 240);
    if (!cleaned) return [];
    const ftsQuery = cleaned.split(/\s+/u).filter(Boolean).map((term) => `"${term.replaceAll('"', '""')}"*`).join(" OR ");
    try {
      const result = await this.client.execute({
        sql: `SELECT d.id,d.title,d.content_text,d.publisher,d.source_family,d.published_at,d.canonical_url
          FROM intelligence_documents_fts f
          JOIN intelligence_documents d ON d.id=f.document_id
          WHERE intelligence_documents_fts MATCH ?
          ORDER BY bm25(intelligence_documents_fts, 0.0, 4.0, 1.0, 0.5), d.published_at DESC
          LIMIT ?`,
        args: [ftsQuery, Math.max(1, Math.min(limit, 100))],
      });
      return result.rows.map((row) => ({
        id: text(row.id), title: text(row.title), passage: snippet(text(row.content_text), cleaned),
        publisher: nullableText(row.publisher), sourceFamily: text(row.source_family),
        publishedAt: nullableText(row.published_at), canonicalUrl: nullableText(row.canonical_url),
        whyMatched: "Exact terms in this source",
      }));
    } catch {
      const result = await this.client.execute({
        sql: `SELECT id,title,content_text,publisher,source_family,published_at,canonical_url
          FROM intelligence_documents WHERE lower(title || ' ' || content_text) LIKE ?
          ORDER BY published_at DESC LIMIT ?`,
        args: [`%${cleaned.toLocaleLowerCase()}%`, Math.max(1, Math.min(limit, 100))],
      });
      return result.rows.map((row) => ({
        id: text(row.id), title: text(row.title), passage: snippet(text(row.content_text), cleaned),
        publisher: nullableText(row.publisher), sourceFamily: text(row.source_family),
        publishedAt: nullableText(row.published_at), canonicalUrl: nullableText(row.canonical_url),
        whyMatched: "Exact terms in this source",
      }));
    }
  }

  async getDocument(id: string): Promise<IntelligenceStoredDocument | null> {
    const result = await this.client.execute({ sql: `SELECT * FROM intelligence_documents WHERE id=? LIMIT 1`, args: [id] });
    const row = result.rows[0];
    return row ? storedDocument(row) : null;
  }

  async listDocuments(input: { limit?: number; before?: string | null } = {}) {
    const args: Array<string | number> = [];
    const where = input.before ? "WHERE published_at < ?" : "";
    if (input.before) args.push(input.before);
    args.push(Math.max(1, Math.min(input.limit ?? 100, 10_000)));
    const result = await this.client.execute({
      sql: `SELECT * FROM intelligence_documents ${where}
        ORDER BY published_at DESC, id DESC LIMIT ?`,
      args,
    });
    return result.rows.map(storedDocument);
  }

  async enqueueJob(input: { ownerId: string; jobType: IntelligenceJob["jobType"]; payload?: Record<string, unknown>; priority?: number }) {
    const id = randomUUID(); const time = nowIso();
    await this.client.execute({
      sql: `INSERT INTO intelligence_jobs(id,owner_id,job_type,status,priority,payload_json,available_at,created_at,updated_at)
        VALUES(?,?,?,'pending',?,?,?,?,?)`,
      args: [id, input.ownerId, input.jobType, input.priority ?? 100, JSON.stringify(input.payload ?? {}), time, time, time],
    });
    return id;
  }

  async leaseNextJob(ownerId: string, leaseOwner: string, jobType?: IntelligenceJob["jobType"]): Promise<IntelligenceJob | null> {
    const time = nowIso();
    const expired = new Date(Date.now() - 30 * 60_000).toISOString();
    const typeClause = jobType ? "AND job_type=?" : "";
    const result = await this.client.execute({
      sql: `UPDATE intelligence_jobs SET status='leased',lease_owner=?,lease_expires_at=?,attempts=attempts+1,updated_at=?
        WHERE id=(SELECT id FROM intelligence_jobs WHERE owner_id=? AND available_at<=?
          AND (status='pending' OR (status='leased' AND lease_expires_at<?))
          ${typeClause}
          ORDER BY priority ASC,created_at ASC LIMIT 1)
        RETURNING *`,
      args: [
        leaseOwner,
        new Date(Date.now() + 30 * 60_000).toISOString(),
        time,
        ownerId,
        time,
        expired,
        ...(jobType ? [jobType] : []),
      ],
    });
    const row = result.rows[0];
    return row ? {
      id: text(row.id), ownerId: text(row.owner_id), jobType: text(row.job_type) as IntelligenceJob["jobType"],
      status: text(row.status) as IntelligenceJob["status"], payload: parseJson(row.payload_json, {}),
      checkpoint: parseJson(row.checkpoint_json, {}), attempts: number(row.attempts),
    } : null;
  }

  async checkpointJob(jobId: string, checkpoint: Record<string, unknown>) {
    await this.client.execute({
      sql: `UPDATE intelligence_jobs SET checkpoint_json=?,updated_at=? WHERE id=? AND status='leased'`,
      args: [JSON.stringify(checkpoint), nowIso(), jobId],
    });
  }

  async completeJob(jobId: string) {
    const time = nowIso();
    await this.client.execute({
      sql: `UPDATE intelligence_jobs SET status='completed',completed_at=?,updated_at=?,lease_owner=NULL,lease_expires_at=NULL WHERE id=?`,
      args: [time, time, jobId],
    });
  }

  async failJob(jobId: string, failure: string) {
    await this.client.execute({
      sql: `UPDATE intelligence_jobs SET status='failed',failure=?,updated_at=?,lease_owner=NULL,lease_expires_at=NULL WHERE id=?`,
      args: [failure.slice(0, 4_000), nowIso(), jobId],
    });
  }

  async upsertSource(source: Omit<IntelligenceSourceConnection, "id"> & { id?: string }) {
    const id = source.id ?? createHash("sha256").update(`${source.ownerId}:${source.sourceType}:${source.externalKey}`).digest("hex").slice(0, 32);
    const time = nowIso();
    await this.client.execute({
      sql: `INSERT INTO intelligence_sources(id,owner_id,source_type,external_key,name,status,config_json,credential_json,checkpoint_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,source_type,external_key) DO UPDATE SET
        name=excluded.name,status=excluded.status,config_json=excluded.config_json,
        credential_json=COALESCE(excluded.credential_json,intelligence_sources.credential_json),
        checkpoint_json=excluded.checkpoint_json,updated_at=excluded.updated_at`,
      args: [id, source.ownerId, source.sourceType, source.externalKey, source.name, source.status,
        JSON.stringify(source.config), source.credential ? JSON.stringify(source.credential) : null,
        JSON.stringify(source.checkpoint), time, time],
    });
    return id;
  }

  async getSource(ownerId: string, sourceType: string, externalKey?: string) {
    const args: string[] = [ownerId, sourceType];
    let where = "owner_id=? AND source_type=?";
    if (externalKey) { where += " AND external_key=?"; args.push(externalKey); }
    const result = await this.client.execute({ sql: `SELECT * FROM intelligence_sources WHERE ${where} ORDER BY updated_at DESC LIMIT 1`, args });
    const row = result.rows[0];
    return row ? {
      id: text(row.id), ownerId: text(row.owner_id), sourceType: text(row.source_type), externalKey: text(row.external_key),
      name: text(row.name), status: text(row.status), config: parseJson(row.config_json, {}),
      credential: parseJson<Record<string, unknown> | null>(row.credential_json, null), checkpoint: parseJson(row.checkpoint_json, {}),
    } : null;
  }

  async enqueueResearch(input: { ownerId: string; signalId: string; signalLabel: string; question?: string | null }) {
    const existing = await this.client.execute({
      sql: `SELECT id FROM intelligence_research_requests
        WHERE owner_id=? AND signal_id=? AND status IN ('pending','leased')
        ORDER BY requested_at DESC LIMIT 1`,
      args: [input.ownerId, input.signalId],
    });
    if (existing.rows[0]) return text(existing.rows[0].id);
    const id = randomUUID();
    const jobId = randomUUID();
    const time = nowIso();
    await this.client.batch([
      {
        sql: `INSERT INTO intelligence_research_requests(id,owner_id,signal_id,signal_label,question,status,requested_at)
          VALUES(?,?,?,?,?,'pending',?)`,
        args: [id, input.ownerId, input.signalId, input.signalLabel, input.question ?? null, time],
      },
      {
        sql: `INSERT INTO intelligence_jobs(id,owner_id,job_type,status,priority,payload_json,available_at,created_at,updated_at)
          VALUES(?,?,'research','pending',50,?,?,?,?)`,
        args: [jobId, input.ownerId, JSON.stringify({ requestId: id, signalId: input.signalId }), time, time, time],
      },
    ], "write");
    return id;
  }

  async getResearchRequest(id: string) {
    const result = await this.client.execute({
      sql: `SELECT * FROM intelligence_research_requests WHERE id=? LIMIT 1`,
      args: [id],
    });
    return result.rows[0] ? researchRequest(result.rows[0]) : null;
  }

  async listResearchRequests(ownerId: string, limit = 20) {
    const result = await this.client.execute({
      sql: `SELECT * FROM intelligence_research_requests WHERE owner_id=?
        ORDER BY requested_at DESC LIMIT ?`,
      args: [ownerId, Math.max(1, Math.min(limit, 100))],
    });
    return result.rows.map(researchRequest);
  }

  async markResearchRunning(id: string) {
    await this.client.execute({
      sql: `UPDATE intelligence_research_requests SET status='leased',failure=NULL WHERE id=? AND status='pending'`,
      args: [id],
    });
  }

  async completeResearch(id: string, result: IntelligenceResearchResult) {
    await this.client.execute({
      sql: `UPDATE intelligence_research_requests
        SET status='completed',completed_at=?,result_json=?,failure=NULL WHERE id=? AND status IN ('pending','leased')`,
      args: [nowIso(), JSON.stringify(result), id],
    });
  }

  async failResearch(id: string, failure: string) {
    await this.client.execute({
      sql: `UPDATE intelligence_research_requests SET status='failed',failure=? WHERE id=?`,
      args: [failure.slice(0, 4_000), id],
    });
  }

  async repairCanonicalOwner(ownerId: string) {
    const signalSubquery = `SELECT s.signal_id FROM intelligence_signals s
      JOIN intelligence_active_refresh a ON a.refresh_id=s.refresh_id
      WHERE lower(s.label)=lower(intelligence_research_requests.signal_label) LIMIT 1`;
    const results = await this.client.batch([
      {
        sql: `UPDATE intelligence_research_requests
          SET owner_id=?,status=CASE WHEN status='leased' THEN 'pending' ELSE status END
          WHERE owner_id<>? AND status IN ('pending','leased')`,
        args: [ownerId, ownerId],
      },
      {
        sql: `UPDATE intelligence_jobs
          SET owner_id=?,status='pending',lease_owner=NULL,lease_expires_at=NULL,updated_at=?
          WHERE owner_id<>? AND job_type='research' AND status IN ('pending','leased')`,
        args: [ownerId, nowIso(), ownerId],
      },
      {
        sql: `UPDATE intelligence_research_requests SET signal_id=(${signalSubquery})
          WHERE owner_id=? AND status IN ('pending','leased')
          AND EXISTS (${signalSubquery}) AND signal_id<>(${signalSubquery})`,
        args: [ownerId],
      },
    ], "write");
    return {
      requestsMigrated: results[0]?.rowsAffected ?? 0,
      jobsMigrated: results[1]?.rowsAffected ?? 0,
      signalIdsRepaired: results[2]?.rowsAffected ?? 0,
    };
  }
}

function intelligenceUsesRemoteTurso() {
  return process.env.INTELLIGENCE_STORE?.trim().toLocaleLowerCase() === "turso";
}

let singleton: TursoIntelligenceStore | null = null;

export function getTursoIntelligenceStore() {
  singleton ??= new TursoIntelligenceStore();
  return singleton;
}
