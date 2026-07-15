import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });
loadEnvironment({ quiet: true });

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decryptCredential, type EncryptedCredential } from "../src/lib/intelligence/oauth-crypto";
import {
  getGmailMessage,
  gmailMessageToEnvelope,
  listGmailMessageIds,
  newsletterBackfillQuery,
  refreshGmailAccessToken,
  sendGmailMessage,
  type GmailStoredCredential,
} from "../src/lib/intelligence/gmail";
import { sourceFamilyName } from "../src/lib/intelligence/sources";
import { getTursoIntelligenceStore, type IntelligenceStoredDocument } from "../src/lib/intelligence/store";
import {
  IntelligenceAnalysisOutputSchema,
  IntelligenceResearchBundleSchema,
  IntelligenceResearchOutputSchema,
  IntelligenceWorkBundleSchema,
} from "../src/lib/intelligence/agent-worker/contracts";
import {
  auditDeterministicSignalQuality,
  buildDeterministicSignals,
} from "../src/lib/intelligence/agent-worker/deterministic";
import { auditSignalLabels } from "../src/lib/intelligence/agent-worker/signal-language";
import { loadLocalIntelligenceKeychain } from "../src/lib/intelligence/agent-worker/local-keychain";
import { canonicalIntelligenceOwnerId } from "../src/lib/intelligence/owner";

loadLocalIntelligenceKeychain();

if (process.env.INTELLIGENCE_AGENT_API_FALLBACK_ENABLED?.trim().toLowerCase() !== "true") {
  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_API_KEY;
}

const ROOT = process.cwd();
const WORK_DIR = resolve(ROOT, ".intelligence-worker");

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function intArgument(name: string, fallback: number, max: number) {
  return Math.max(1, Math.min(Number(argument(name) ?? fallback), max));
}

function ownerId() {
  const requested = argument("--owner");
  if (requested?.startsWith("google:")) {
    return canonicalIntelligenceOwnerId(requested.slice("google:".length));
  }
  return canonicalIntelligenceOwnerId();
}

function words(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function envelopeDocuments(envelope: ReturnType<typeof gmailMessageToEnvelope>): IntelligenceStoredDocument[] {
  const editorial = (envelope.segments ?? []).filter((segment) =>
    segment.segmentType === "editorial" || segment.segmentType === "unknown",
  );
  const items = editorial.length ? editorial : [{
    segmentIndex: 0,
    segmentType: "unknown" as const,
    title: envelope.title ?? null,
    contentText: envelope.contentText,
    outboundUrl: envelope.canonicalUrl ?? null,
    contentHash: sha(envelope.contentText),
    tokenCount: words(envelope.contentText),
    parserVersion: "coarse-fallback.v1",
    confidence: 0.3,
    metadata: {},
  }];
  const family = sourceFamilyName(envelope.publisherName ?? envelope.authorName ?? "Unknown source");
  return items.map((segment) => {
    const externalId = `${envelope.externalId}:${segment.segmentIndex}`;
    return {
      id: sha(`gmail:${externalId}`).slice(0, 32),
      externalId,
      sourceType: envelope.sourceType,
      sourceFamily: family,
      title: segment.title || envelope.title || "Untitled newsletter item",
      publisher: envelope.publisherName ?? null,
      author: envelope.authorName ?? null,
      publishedAt: envelope.publishedAt ?? null,
      canonicalUrl: segment.outboundUrl || envelope.canonicalUrl || envelope.originalUrl,
      contentText: segment.contentText,
      contentHash: segment.contentHash || sha(segment.contentText),
      editorialTokens: segment.tokenCount || words(segment.contentText),
      segmentationConfidence: segment.confidence,
      parserVersion: segment.parserVersion,
      raw: { envelopeExternalId: envelope.externalId, segmentMetadata: segment.metadata },
    };
  });
}

async function collectGmail() {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  const source = await store.getSource(ownerId(), "gmail");
  if (!source?.credential) throw new Error("Connect Gmail after enabling the Turso Intelligence store.");
  const credential = decryptCredential<GmailStoredCredential>(source.credential as EncryptedCredential);
  const accessToken = await refreshGmailAccessToken(credential.refreshToken);
  const mode = argument("--mode") === "backfill" ? "backfill" : "incremental";
  const end = argument("--end") || new Date().toISOString().slice(0, 10);
  const start = argument("--start") || (() => {
    const date = new Date(); date.setUTCDate(date.getUTCDate() - (mode === "backfill" ? 183 : 3));
    return date.toISOString().slice(0, 10);
  })();
  const checkpoint: Record<string, unknown> = source.checkpoint ?? {};
  const savedModeCheckpoint = checkpoint[mode];
  const modeCheckpoint = savedModeCheckpoint && typeof savedModeCheckpoint === "object"
    ? savedModeCheckpoint as Record<string, unknown>
    : checkpoint.mode === mode
      ? checkpoint
      : {};
  const pageToken = typeof modeCheckpoint.nextPageToken === "string"
    ? modeCheckpoint.nextPageToken
    : undefined;
  const page = await listGmailMessageIds(accessToken, {
    query: newsletterBackfillQuery(start, end),
    pageToken,
    maxResults: intArgument("--batch", 10, 100),
  });
  const documents: IntelligenceStoredDocument[] = [];
  for (const item of page.messages ?? []) {
    const message = await getGmailMessage(accessToken, item.id);
    documents.push(...envelopeDocuments(gmailMessageToEnvelope(message, ownerId())));
  }
  await store.putDocuments(documents);
  await store.upsertSource({
    ...source,
    checkpoint: {
      ...checkpoint,
      activeMode: mode,
      [mode]: {
        mode, start, end,
        nextPageToken: page.nextPageToken ?? null,
        complete: !page.nextPageToken,
        lastMessageCount: page.messages?.length ?? 0,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  return { messages: page.messages?.length ?? 0, documents: documents.length, hasMore: Boolean(page.nextPageToken) };
}

async function prepareBundle() {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  const requestedJobType = argument("--kind") === "backfill" ? "backfill" : "daily_refresh";
  const job = await store.leaseNextJob(ownerId(), `codex:${process.pid}`, requestedJobType)
    ?? { id: await store.enqueueJob({ ownerId: ownerId(), jobType: requestedJobType }), checkpoint: {} };
  const leased = "jobType" in job
    ? job
    : await store.leaseNextJob(ownerId(), `codex:${process.pid}`, requestedJobType);
  if (!leased) throw new Error("Could not lease the prepared Intelligence job.");
  const documents = await store.listDocuments({ limit: intArgument("--batch", 10, 100) });
  if (!documents.length) throw new Error("No retained documents are available. Run collect-gmail first.");
  const refreshId = await store.beginRefresh(requestedJobType === "backfill" ? "backfill" : "daily");
  const active = await store.getSignals({ limit: 250 });
  const bundle = IntelligenceWorkBundleSchema.parse({
    schemaVersion: "crashboard-intelligence-work-bundle.v1",
    jobId: leased.id,
    jobType: leased.jobType,
    jobPayload: leased.payload,
    refreshId,
    generatedAt: new Date().toISOString(),
    instructions: [
      "Identify stable topics, exact keywords, organizations, systems, programmes, and concrete actions.",
      "Count each supplied editorial item once; never treat text chunks as separate trend votes.",
      "Base why-now claims on the supplied evidence and say when a cause is unknown.",
      "Return only JSON matching crashboard-intelligence-analysis.v1.",
    ],
    documents: documents.map((document) => ({
      id: document.id, title: document.title, sourceFamily: document.sourceFamily,
      publishedAt: document.publishedAt ?? null, canonicalUrl: document.canonicalUrl ?? null,
      contentText: document.contentText,
    })),
    existingSignals: active.signals.map((signal) => ({
      id: signal.id,
      kind: signal.kind,
      label: signal.label,
      aliases: [],
    })),
  });
  const directory = resolve(WORK_DIR, "inbox");
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `${leased.id}-${refreshId}.json`);
  await writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await store.checkpointJob(leased.id, { refreshId, bundleFile: file, documentsPrepared: documents.length });
  return { jobId: leased.id, refreshId, file, documents: documents.length };
}

async function prepareResearchBundle() {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  const leased = await store.leaseNextJob(ownerId(), `codex-research:${process.pid}`, "research");
  if (!leased) return { noOp: true, reason: "No research request is pending." };
  const requestId = typeof leased.payload.requestId === "string" ? leased.payload.requestId : "";
  if (!requestId) {
    await store.failJob(leased.id, "Research job is missing requestId.");
    throw new Error("Research job is missing requestId.");
  }
  const request = await store.getResearchRequest(requestId);
  if (!request) {
    await store.failJob(leased.id, "Research request no longer exists.");
    throw new Error("Research request no longer exists.");
  }
  const signal = await store.getSignal(request.signalId);
  if (!signal) {
    const failure = `Signal ${request.signalLabel} is no longer active.`;
    await store.failResearch(request.id, failure);
    await store.failJob(leased.id, failure);
    throw new Error(failure);
  }
  const bundle = IntelligenceResearchBundleSchema.parse({
    schemaVersion: "crashboard-intelligence-research-bundle.v1",
    jobId: leased.id,
    requestId: request.id,
    generatedAt: new Date().toISOString(),
    question: request.question,
    instructions: [
      "Investigate the signal using official and original sources first, then independent corroboration.",
      "Use the Codex web tools and logged-in Codex account. Do not call the OpenAI API.",
      "Distinguish confirmed facts from inference and state important unknowns explicitly.",
      "Retain clickable HTTPS source URLs and short supporting passages.",
      "Research evidence may enrich the explanation but must not change trend scores or measurement counts.",
      "Return only JSON matching crashboard-intelligence-research.v1.",
    ],
    signal: {
      id: signal.id,
      key: signal.key,
      kind: signal.kind,
      label: signal.label,
      direction: signal.direction,
      evidenceStrength: signal.evidenceStrength,
      currentReach: signal.currentReach,
      previousReach: signal.previousReach,
      whyNow: signal.whyNow,
      whyItMatters: signal.whyItMatters,
      whatToWatch: signal.whatToWatch,
      related: signal.related,
      evidence: signal.evidence.filter((item) => !item.isResearch).slice(0, 10).map((item) => ({
        title: item.title,
        passage: item.passage,
        url: item.url,
        publisher: item.publisher,
        publishedAt: item.publishedAt,
        sourceFamily: item.sourceFamily,
      })),
    },
  });
  const directory = resolve(WORK_DIR, "inbox");
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `research-${leased.id}-${request.id}.json`);
  await writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await store.markResearchRunning(request.id);
  await store.checkpointJob(leased.id, {
    requestId: request.id,
    signalId: signal.id,
    bundleFile: file,
    preparedAt: new Date().toISOString(),
  });
  return { noOp: false, jobId: leased.id, requestId: request.id, signalId: signal.id, signalLabel: signal.label, file };
}

async function importAnalysis(file: string) {
  const parsed = IntelligenceAnalysisOutputSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")));
  const store = getTursoIntelligenceStore();
  const known = new Set((await store.listDocuments({ limit: 500 })).map((document) => document.id));
  for (const signal of parsed.signals) {
    for (const evidence of signal.evidence) {
      if (!known.has(evidence.documentId)) throw new Error(`Unknown evidence document: ${evidence.documentId}`);
    }
  }
  await store.putSignals(parsed.refreshId, parsed.signals);
  await store.checkpointJob(parsed.jobId, {
    refreshId: parsed.refreshId,
    analyzedDocuments: parsed.reviewedDocumentIds.length,
    signalsImported: parsed.signals.length,
  });
  return { jobId: parsed.jobId, refreshId: parsed.refreshId, signals: parsed.signals.length };
}

async function importResearch(file: string) {
  const parsed = IntelligenceResearchOutputSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")));
  const store = getTursoIntelligenceStore();
  const request = await store.getResearchRequest(parsed.requestId);
  if (!request) throw new Error("The research request no longer exists.");
  if (request.signalId !== parsed.signalId || request.signalLabel !== parsed.signalLabel) {
    throw new Error("Research output does not match the leased signal.");
  }
  await store.completeResearch(parsed.requestId, {
    whatChanged: parsed.whatChanged,
    whyNow: parsed.whyNow,
    whyItMatters: parsed.whyItMatters,
    whatToWatch: parsed.whatToWatch,
    assessmentChange: parsed.assessmentChange,
    evidenceStrength: parsed.evidenceStrength,
    sources: parsed.sources,
    unknowns: parsed.unknowns,
  });
  await store.completeJob(parsed.jobId);
  return {
    jobId: parsed.jobId,
    requestId: parsed.requestId,
    signalId: parsed.signalId,
    signalLabel: parsed.signalLabel,
    sources: parsed.sources.length,
    completed: true,
  };
}

async function repairOwner() {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  return { ownerId: ownerId(), ...(await store.repairCanonicalOwner(ownerId())) };
}

async function workerStatus() {
  const store = getTursoIntelligenceStore();
  const [health, source, requests] = await Promise.all([
    store.health(),
    store.getSource(ownerId(), "gmail"),
    store.listResearchRequests(ownerId(), 100),
  ]);
  return {
    ...health,
    gmailConnected: Boolean(source?.credential && source.status === "active"),
    pendingResearch: requests.filter((request) => request.status === "pending" || request.status === "running").length,
    completedResearch: requests.filter((request) => request.status === "completed").length,
  };
}

async function deterministicRun(count: number) {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  const now = Date.now();
  const topics = [
    "C-UAS procurement trial", "AI compute funding", "cyber resilience contract",
    "autonomous systems deployment", "NATO defence production", "Canadian radar programme",
  ];
  const docs: IntelligenceStoredDocument[] = Array.from({ length: count }, (_, index) => {
    const topic = topics[index % topics.length]!;
    const rising = index >= Math.floor(count * 0.55) ? ` ${topics[index % 2]!} ${topics[index % 2]!}` : "";
    const publishedAt = new Date(now - (count - index) * Math.max(1, Math.floor(120 / count)) * DAY_MS).toISOString();
    return {
      id: sha(`smoke:${count}:${index}`).slice(0, 32),
      externalId: `smoke:${count}:${index}`,
      sourceType: "email_newsletter",
      sourceFamily: `Representative Source ${(index % 7) + 1}`,
      title: `${topic} update ${index + 1}`,
      publisher: `Representative Source ${(index % 7) + 1}`,
      publishedAt,
      canonicalUrl: `https://example.invalid/intelligence/${count}/${index}`,
      contentText: `${topic}. A named buyer announced funding, testing, procurement, and deployment milestones.${rising}`,
      contentHash: sha(`${topic}:${index}`),
      editorialTokens: 24,
      segmentationConfidence: 0.92,
      parserVersion: "smoke.v1",
    };
  });
  await store.putDocuments(docs);
  const refreshId = await store.beginRefresh("test");
  const signals = buildDeterministicSignals(await store.listDocuments({ limit: Math.min(500, count) }));
  if (!signals.length) throw new Error("Deterministic analysis produced no signals.");
  await store.putSignals(refreshId, signals);
  const validation = await store.validateRefresh(refreshId);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  await store.publishRefresh(refreshId);
  return { refreshId, documents: docs.length, signals: signals.length, validation };
}

async function refreshDeterministicSignals() {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  const documents = await store.listDocuments({ limit: 10_000 });
  if (!documents.length) throw new Error("No retained documents are available for signal refresh.");
  const requestedKind = argument("--kind");
  const kind = requestedKind === "backfill" || requestedKind === "daily" || requestedKind === "manual"
    ? requestedKind
    : "manual";
  const refreshId = await store.beginRefresh(kind);
  try {
    const signals = buildDeterministicSignals(documents);
    if (!signals.length) throw new Error("Signal refresh produced no qualifying signals.");
    await store.putSignals(refreshId, signals);
    const validation = await store.validateRefresh(refreshId);
    if (!validation.ok) throw new Error(validation.errors.join(" "));
    await store.publishRefresh(refreshId);
    return { refreshId, documents: documents.length, signals: signals.length, validation, published: true };
  } catch (error) {
    await store.failRefresh(refreshId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function auditSignals() {
  const store = getTursoIntelligenceStore();
  await store.initialize();
  const documents = await store.listDocuments({ limit: 10_000 });
  const proposed = buildDeterministicSignals(documents);
  const active = await store.getSignals({ limit: 250 });
  const activeAudit = auditSignalLabels(active.signals);
  return {
    active: {
      refreshId: (await store.health()).activeRefreshId,
      completeThrough: active.completeThrough,
      total: activeAudit.total,
      meaningfulRate: activeAudit.meaningfulRate,
      blockedLabels: activeAudit.blocked.map((signal) => signal.label),
      kindCounts: activeAudit.kindCounts,
      labels: active.signals.map((signal) => signal.label),
    },
    proposed: auditDeterministicSignalQuality(documents, proposed),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

async function sendBrief() {
  const store = getTursoIntelligenceStore();
  const source = await store.getSource(ownerId(), "gmail");
  if (!source?.credential) throw new Error("Connect Gmail before sending the morning brief.");
  const credential = decryptCredential<GmailStoredCredential>(source.credential as EncryptedCredential);
  const accessToken = await refreshGmailAccessToken(credential.refreshToken);
  const response = await store.getSignals({ limit: 12 });
  if (response.dataStatus !== "ready" || !response.signals.length) throw new Error("No active Intelligence refresh is ready for a brief.");
  const signals = response.signals.filter((signal) => signal.direction === "new" || signal.direction === "rising").slice(0, 3);
  const selected = signals.length ? signals : response.signals.slice(0, 3);
  const date = response.completeThrough || new Date().toISOString().slice(0, 10);
  const subject = `Crashboard Intelligence · ${date}`;
  const text = selected.map((signal, index) => [
    `${index + 1}. ${signal.label} — ${signal.direction}`,
    signal.whyNow,
    `Why it matters: ${signal.whyItMatters}`,
    `Watch: ${signal.whatToWatch}`,
  ].join("\n")).join("\n\n");
  const html = `<main style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:28px"><h1>${escapeHtml(subject)}</h1>${selected.map((signal) => `<section style="border-top:1px solid #ddd;padding:18px 0"><h2>${escapeHtml(signal.label)}</h2><p>${escapeHtml(signal.whyNow)}</p><p><strong>Why it matters:</strong> ${escapeHtml(signal.whyItMatters)}</p><p><strong>What to watch:</strong> ${escapeHtml(signal.whatToWatch)}</p></section>`).join("")}<p><a href="${escapeHtml((process.env.NEXT_PUBLIC_SITE_URL || "https://crashboard.dev").replace(/\/$/u, ""))}/dashboard/intelligence">Open Intelligence</a></p></main>`;
  const sent = await sendGmailMessage(accessToken, {
    to: process.env.INTELLIGENCE_DIGEST_TO?.trim() || credential.email || "m.andrew.davies@gmail.com",
    subject,
    text,
    html,
  });
  return { sent: true, messageId: sent.id, signals: selected.length, completeThrough: response.completeThrough };
}

const DAY_MS = 86_400_000;

async function main() {
  const command = process.argv[2] || "status";
  const store = getTursoIntelligenceStore();
  let result: unknown;
  if (command === "init") { await store.initialize(); result = await workerStatus(); }
  else if (command === "status") result = await workerStatus();
  else if (command === "collect-gmail") result = await collectGmail();
  else if (command === "prepare") result = await prepareBundle();
  else if (command === "prepare-research") result = await prepareResearchBundle();
  else if (command === "import") {
    const file = argument("--file"); if (!file) throw new Error("Pass --file <analysis.json>.");
    result = await importAnalysis(file);
  } else if (command === "import-research") {
    const file = argument("--file"); if (!file) throw new Error("Pass --file <research.json>.");
    result = await importResearch(file);
  } else if (command === "validate") {
    const refreshId = argument("--refresh"); if (!refreshId) throw new Error("Pass --refresh <id>.");
    result = await store.validateRefresh(refreshId);
  } else if (command === "publish") {
    const refreshId = argument("--refresh"); const jobId = argument("--job");
    if (!refreshId) throw new Error("Pass --refresh <id>.");
    await store.publishRefresh(refreshId); if (jobId) await store.completeJob(jobId);
    result = { refreshId, published: true, jobId: jobId ?? null };
  } else if (command === "smoke") result = await deterministicRun(intArgument("--documents", 10, 100));
  else if (command === "audit-signals") result = await auditSignals();
  else if (command === "refresh") result = await refreshDeterministicSignals();
  else if (command === "repair-owner") result = await repairOwner();
  else if (command === "send-brief") result = await sendBrief();
  else throw new Error(`Unknown command: ${command}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
