import { config } from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local", quiet: true });

import { loadLocalIntelligenceKeychain } from "../src/lib/intelligence/agent-worker/local-keychain";
import {
  DEFENCE_WIKI_PACKET_VERSION,
  canadaLanguagePattern,
  compactText,
  defenceLanguagePattern,
  defenceSourcePacketV1Schema,
  safePublicUrl,
  stablePacketHash,
  type DefenceSourcePacketV1,
} from "../src/lib/intelligence/defence-wiki-contract";
import { getTursoIntelligenceStore } from "../src/lib/intelligence/store";

loadLocalIntelligenceKeychain();
process.env.INTELLIGENCE_STORE = "turso";

type Row = Record<string, unknown>;
type Mode = "inventory" | "export";

const NEWSLETTER_LABEL = "Newsletters/Defence";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string) {
  return process.argv.includes(name);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    try {
      return asStringArray(JSON.parse(value));
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseJson(value: unknown): Row {
  if (value !== null && typeof value === "object") return asObject(value);
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function isoDate(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function slug(value: string) {
  return value.toLocaleLowerCase("en-CA").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "source";
}

function metadata(row: Row) {
  const raw = parseJson(row.raw_json);
  return asObject(raw.legacyMetadata ?? raw.metadata ?? raw);
}

function isCoarseNewsletter(row: Row) {
  const raw = parseJson(row.raw_json);
  const segment = asObject(raw.segmentMetadata);
  return segment.coarse_item === true
    || segment.fallback === true
    || asString(row.parser_version) === "coarse-fallback.v1";
}

function labels(row: Row) {
  const raw = parseJson(row.raw_json);
  const meta = metadata(row);
  return unique([
    ...asStringArray(raw.envelopeLabels),
    ...asStringArray(meta.labels),
    ...asStringArray(asObject(meta.gmail).labels),
    ...asStringArray(asObject(meta.sourceMetadata).labels),
  ]);
}

function freshness(publishedAt: string | null) {
  if (!publishedAt) return "unknown" as const;
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  if (ageDays <= 120) return "current" as const;
  if (ageDays <= 365) return "review_due" as const;
  return "stale" as const;
}

function authority(row: Row): DefenceSourcePacketV1["authorityTier"] {
  const url = safePublicUrl(row.canonical_url);
  const host = url ? new URL(url).hostname.toLocaleLowerCase("en-CA") : "";
  if (host.endsWith("canada.ca") || host.endsWith("gc.ca") || host.endsWith("nato.int") || host.endsWith("mil")) return "primary";
  if (/(defence|defense|military|naval|aerospace|cyber)/iu.test(`${asString(row.publisher)} ${asString(row.source_family)}`)) return "specialist";
  if (asString(row.source_type) === "email_newsletter") return "aggregator";
  return "unknown";
}

function signalMentioned(signal: Row, value: string) {
  const label = asString(signal.label);
  if (!label) return false;
  const normalizedValue = value.toLocaleLowerCase("en-CA");
  if (label.length >= 5 && normalizedValue.includes(label.toLocaleLowerCase("en-CA"))) return true;
  const explicitAcronyms = label.match(/\b[A-Z][A-Z0-9-]*\b/g) ?? [];
  const acronym = explicitAcronyms.join("")
    || label.split(/[^A-Za-z0-9]+/).filter((part) => /[A-Za-z]/.test(part)).map((part) => part[0]).join("").toUpperCase();
  return acronym.length >= 3 && new RegExp(`\\b${acronym.replace(/[^A-Z0-9]/g, "[- ]?")}\\b`, "iu").test(value);
}

function extractDefenceExcerpt(title: string, content: string) {
  const sentences = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const selected: string[] = [];
  for (let index = 0; index < sentences.length; index += 1) {
    const defenceText = sentences[index]
      .replace(/\bmilitary (?:institute|academy|college|school)\b/giu, "")
      .replace(/\bsecret weapon\b/giu, "");
    const ceremonialOrSport = /\b(volleyball|basketball|football|soccer|sports?|commissioning ceremony|graduat(?:e|ing|ion)|cadet)\b/iu.test(defenceText);
    const operationalContext = /\b(procurement|contract|budget|technology|system|capability|operation|mission|deployment|security|combat|weapon system|missile|naval platform)\b/iu.test(defenceText);
    if (ceremonialOrSport && !operationalContext) continue;
    if (!defenceLanguagePattern.test(defenceText)) continue;
    selected.push(sentences[index]);
    if (index + 1 < sentences.length) selected.push(sentences[index + 1]);
    if (selected.join(" ").length >= 1200) break;
  }
  if (selected.length) return compactText(unique(selected).join(" "), 1600);
  return defenceLanguagePattern.test(title) ? compactText(`${title}. ${content}`, 1600) : "";
}

function inferredConcepts(value: string, activeSignals: Row[]) {
  const mentioned = activeSignals.filter((signal) => signalMentioned(signal, value));
  const labels = unique(mentioned.map((signal) => asString(signal.label)));
  const available = new Map(activeSignals.map((signal) => [asString(signal.label).toLocaleLowerCase("en-CA"), asString(signal.label)]));
  const addAvailable = (label: string) => {
    const found = available.get(label.toLocaleLowerCase("en-CA"));
    if (found) labels.push(found);
  };
  if (/\b(c[- ]?uas|counter[- ]?uas|counter[- ]?drone)\b/iu.test(value)) {
    addAvailable("C-UAS");
    addAvailable("Counter-drone defence");
  }
  if (/\b(collaborative combat aircraft|cca)\b/iu.test(value)) addAvailable("Collaborative Combat Aircraft (CCA)");
  if (/\b(procurement|contract|deal|budget|munition|weapon|arms sale|industrial base|production)\b/iu.test(value)) {
    addAvailable("Defence procurement");
    addAvailable("Defence industrial production");
  }
  if (/\b(navy|naval|warship|submarine|undersea|sonar)\b/iu.test(value)) addAvailable("Submarines and undersea systems");
  if (/\b(isr|intelligence, surveillance|command and control|c4isr)\b/iu.test(value)) addAvailable("Command, control and ISR");
  if (/\b(nato)\b/iu.test(value)) addAvailable("NATO");
  return unique(labels);
}

function tally(values: string[]) {
  const counts = values.reduce((map, value) => map.set(value || "unknown", (map.get(value || "unknown") ?? 0) + 1), new Map<string, number>());
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function deterministicSample<T>(items: T[], size: number, key: (value: T) => string) {
  return [...items]
    .sort((a, b) => createHash("sha256").update(key(a)).digest("hex").localeCompare(createHash("sha256").update(key(b)).digest("hex")))
    .slice(0, size);
}

async function loadUniverse() {
  const store = getTursoIntelligenceStore();
  const [documentsResult, sourcesResult, activeResult, evidenceResult] = await Promise.all([
    store.client.execute(`SELECT * FROM intelligence_documents ORDER BY id ASC`),
    store.client.execute(`SELECT id,source_type,external_key,name,status,cohort,config_json,checkpoint_json,last_success_at,last_error,created_at,updated_at FROM intelligence_sources ORDER BY id ASC`),
    store.client.execute(`SELECT s.* FROM intelligence_signals s JOIN intelligence_active_refresh a ON a.refresh_id=s.refresh_id ORDER BY s.signal_id ASC`),
    store.client.execute(`SELECT e.* FROM intelligence_evidence e JOIN intelligence_active_refresh a ON a.refresh_id=e.refresh_id ORDER BY e.document_id ASC,e.rank ASC`),
  ]);
  return {
    documents: documentsResult.rows as unknown as Row[],
    sources: sourcesResult.rows as unknown as Row[],
    signals: activeResult.rows as unknown as Row[],
    evidence: evidenceResult.rows as unknown as Row[],
  };
}

function buildPackets(universe: Awaited<ReturnType<typeof loadUniverse>>) {
  const signalById = new Map(universe.signals.map((row) => [asString(row.signal_id), row]));
  const evidenceByDocument = new Map<string, Row[]>();
  for (const evidence of universe.evidence) {
    const documentId = asString(evidence.document_id);
    evidenceByDocument.set(documentId, [...(evidenceByDocument.get(documentId) ?? []), evidence]);
  }

  const accepted: DefenceSourcePacketV1[] = [];
  const rejected: Array<{ id: string; title: string; sourceType: string; labels: string[]; reason: string }> = [];
  const generatedAt = new Date().toISOString();

  for (const document of universe.documents) {
    const documentId = asString(document.id);
    const documentLabels = labels(document);
    const hasDefenceLabel = documentLabels.includes(NEWSLETTER_LABEL);
    const coarseNewsletter = isCoarseNewsletter(document);
    const linkedEvidence = evidenceByDocument.get(documentId) ?? [];
    const evidenceSignals = unique(linkedEvidence.map((row) => asString(row.signal_id)))
      .map((id) => signalById.get(id))
      .filter((row): row is Row => Boolean(row));
    const documentTitle = asString(document.title);
    const relevantExcerpt = coarseNewsletter ? "" : extractDefenceExcerpt(documentTitle, asString(document.content_text));
    const articleText = [documentTitle, relevantExcerpt].join(" ");
    const directSignals = coarseNewsletter ? [] : universe.signals.filter((signal) => signalMentioned(signal, relevantExcerpt));
    const linkedSignals = [...new Map([...evidenceSignals, ...directSignals].map((signal) => [asString(signal.signal_id), signal])).values()];
    const text = [articleText, ...linkedEvidence.map((row) => asString(row.passage))].join(" ");
    const defenceSignals = linkedSignals.filter((signal) => defenceLanguagePattern.test([
      asString(signal.label),
      asString(signal.kind),
      asString(signal.signal_key),
      asString(signal.lens_keys),
    ].join(" ")));
    const inferred = inferredConcepts(relevantExcerpt, universe.signals);
    const linkedDefenceContent = !coarseNewsletter && Boolean(relevantExcerpt) && (linkedSignals.length > 0 || inferred.length > 0);
    const selectionReasons: DefenceSourcePacketV1["selectionReasons"] = [];
    if (Boolean(relevantExcerpt) && (defenceSignals.length > 0 || linkedDefenceContent)) selectionReasons.push("defence_concept");
    if (hasDefenceLabel) selectionReasons.push("defence_label");

    if (coarseNewsletter || !selectionReasons.length) {
      rejected.push({
        id: documentId,
        title: asString(document.title) || "Untitled",
        sourceType: asString(document.source_type) || "unknown",
        labels: documentLabels,
        reason: coarseNewsletter
          ? "The record is a coarse mixed-newsletter fallback and cannot be exported without reproducing unrelated newsletter content."
          : linkedSignals.length
          ? "The segment has active signal links but no defence-specific evidence or label."
          : "The segment has no active defence signal link or defence intake label.",
      });
      continue;
    }

    const isNewsletter = asString(document.source_type) === "email_newsletter";
    const conceptSignals = linkedSignals.filter((signal) => asString(signal.kind) !== "organization");
    const entitySignals = linkedSignals.filter((signal) => asString(signal.kind) === "organization");
    const concepts = unique([...conceptSignals.map((signal) => asString(signal.label)), ...inferred]);
    const entities = unique(entitySignals.map((signal) => asString(signal.label)));
    const publishedAt = isoDate(document.published_at);
    const documentAuthority = authority(document);
    const strongestEvidence = linkedSignals.some((signal) => asString(signal.evidence_strength) === "strong");
    const sourceConfidence = isNewsletter
      ? "needs_review" as const
      : documentAuthority === "primary" || strongestEvidence
        ? "high" as const
        : "moderate" as const;
    const canadaRelevant = canadaLanguagePattern.test(`${text} ${entities.join(" ")} ${concepts.join(" ")}`);
    const reasonParts = [];
    if (selectionReasons.includes("defence_concept")) reasonParts.push("it is an article-level source segment linked to active defence signals");
    if (selectionReasons.includes("defence_label")) reasonParts.push(`it was captured under ${NEWSLETTER_LABEL}`);
    const packetBase: Omit<DefenceSourcePacketV1, "contentHash" | "generatedAt"> = {
      schemaVersion: DEFENCE_WIKI_PACKET_VERSION,
      packetId: `crashboard:document:${documentId}`,
      sourceSystem: "crashboard",
      sourceRecordIds: unique([
        `document:${documentId}`,
        ...linkedSignals.map((signal) => `signal:${asString(signal.signal_id)}`),
      ]),
      sourceKind: `${asString(document.source_type) || "unknown"}_segment`,
      title: defenceLanguagePattern.test(documentTitle)
        ? documentTitle
        : compactText(relevantExcerpt, 180) || documentTitle || "Untitled defence source",
      publisher: asString(document.publisher) || asString(document.author) || "Unknown publisher",
      sourceFamily: asString(document.source_family) || slug(asString(document.publisher) || "unknown-source"),
      authorityTier: documentAuthority,
      canonicalUrl: safePublicUrl(document.canonical_url),
      publishedAt,
      capturedAt: isoDate(document.updated_at) ?? isoDate(document.created_at),
      relevantExcerpt: relevantExcerpt || compactText(document.content_text, isNewsletter ? 1600 : 2200),
      summary: null,
      selectionReasons,
      defenceRelevanceReason: `Selected because ${reasonParts.join(" and ")}.`,
      canadaRelevanceReason: canadaRelevant
        ? "The segment names Canada, a Canadian institution, Canadian geography, or a Canadian defence organization."
        : "Global defence context retained for comparison, partnership, competitor, demand, supply-chain, or industrial-gap analysis.",
      concepts,
      entities,
      geography: canadaRelevant ? ["Canada"] : ["Global context"],
      labels: documentLabels,
      sourceConfidence,
      evidenceRole: isNewsletter ? "discovery_lead" : "context",
      freshness: freshness(publishedAt),
      claimRisk: "time_sensitive",
      visibility: isNewsletter ? "internal" : "public",
      reusePolicy: isNewsletter ? "citation_only" : "public_reference",
      needsVerification: isNewsletter || documentAuthority === "unknown",
      relatedTrueNorthIds: [],
    };
    accepted.push(defenceSourcePacketV1Schema.parse({
      ...packetBase,
      contentHash: stablePacketHash(packetBase),
      generatedAt,
    }));
  }

  accepted.sort((a, b) => a.packetId.localeCompare(b.packetId));
  rejected.sort((a, b) => a.id.localeCompare(b.id));
  return { accepted, rejected };
}

function buildInventory(universe: Awaited<ReturnType<typeof loadUniverse>>, selection: ReturnType<typeof buildPackets>, sampleSize: number) {
  const defenceSignals = universe.signals.filter((signal) => defenceLanguagePattern.test(`${asString(signal.label)} ${asString(signal.signal_key)} ${asString(signal.lens_keys)}`));
  return {
    schemaVersion: "defence-wiki-inventory-v1",
    generatedAt: new Date().toISOString(),
    sourceSystem: "crashboard",
    storageContract: "current Turso intelligence store; read-only",
    universe: {
      documents: universe.documents.length,
      newsletterSegments: universe.documents.filter((row) => row.source_type === "email_newsletter").length,
      sourceConnections: universe.sources.length,
      sourceFamilies: new Set(universe.documents.map((row) => asString(row.source_family)).filter(Boolean)).size,
      activeSignals: universe.signals.length,
      defenceSignals: defenceSignals.length,
      activeEvidenceLinks: universe.evidence.length,
      organizationSignals: universe.signals.filter((row) => row.kind === "organization").length,
      systemSignals: universe.signals.filter((row) => row.kind === "system").length,
      programmeSignals: universe.signals.filter((row) => row.kind === "programme").length,
      procurementRelatedSignals: universe.signals.filter((row) => /\b(procurement|contract|tender|programme|program)\b/iu.test(`${asString(row.label)} ${asString(row.signal_key)}`)).length,
    },
    selection: {
      packets: selection.accepted.length,
      sourceDocuments: selection.accepted.length,
      rejectedDocuments: selection.rejected.length,
      byReason: tally(selection.accepted.flatMap((packet) => packet.selectionReasons)),
      bySourceFamily: tally(selection.accepted.map((packet) => packet.sourceFamily)),
      byAuthority: tally(selection.accepted.map((packet) => packet.authorityTier)),
      byEvidenceRole: tally(selection.accepted.map((packet) => packet.evidenceRole)),
      byConfidence: tally(selection.accepted.map((packet) => packet.sourceConfidence)),
      byFreshness: tally(selection.accepted.map((packet) => packet.freshness)),
      byGeography: tally(selection.accepted.flatMap((packet) => packet.geography)),
      byConcept: tally(selection.accepted.flatMap((packet) => packet.concepts)),
      byLabel: tally(selection.accepted.flatMap((packet) => packet.labels)),
    },
    acceptedSample: deterministicSample(selection.accepted, sampleSize, (packet) => packet.packetId).map((packet) => ({
      packetId: packet.packetId,
      title: packet.title,
      publisher: packet.publisher,
      reasons: packet.selectionReasons,
      concepts: packet.concepts,
      labels: packet.labels,
      canonicalUrl: packet.canonicalUrl,
    })),
    rejectedSample: deterministicSample(selection.rejected, sampleSize, (row) => row.id),
  };
}

function inventoryMarkdown(inventory: ReturnType<typeof buildInventory>) {
  const lines = [
    "# Crashboard Defence Wiki Source Inventory",
    "",
    `Generated: ${inventory.generatedAt}`,
    "",
    `Storage: ${inventory.storageContract}`,
    "",
    "## Universe",
    "",
    ...Object.entries(inventory.universe).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Selection",
    "",
    `- Packets: ${inventory.selection.packets}`,
    `- Source segments: ${inventory.selection.sourceDocuments}`,
    `- Rejected segments: ${inventory.selection.rejectedDocuments}`,
    `- Selection reasons: ${JSON.stringify(inventory.selection.byReason)}`,
    "",
    "## Accepted sample",
    "",
    ...inventory.acceptedSample.map((item) => `- **${item.title}** — ${item.publisher}; ${item.reasons.join(", ")}; concepts: ${item.concepts.join(", ") || "none"}`),
    "",
    "## Rejected sample",
    "",
    ...inventory.rejectedSample.map((item) => `- **${item.title}** — ${item.sourceType}; ${item.reason}`),
    "",
    "Accepted packets contain only an article-level segment or bounded defence-specific sentences. Coarse mixed-newsletter fallbacks are rejected. This report does not publish or promote any source.",
  ];
  return `${lines.join("\n")}\n`;
}

async function currentPacketHashes(rawDir: string) {
  const hashes = new Map<string, string>();
  try {
    const files = (await readdir(rawDir)).filter((file) => file.startsWith("crashboard-") && file.endsWith(".json"));
    for (const file of files) {
      try {
        const parsed = defenceSourcePacketV1Schema.parse(JSON.parse(await readFile(path.join(rawDir, file), "utf8")));
        hashes.set(file, parsed.contentHash);
      } catch {
        hashes.set(file, "invalid");
      }
    }
  } catch {
    return hashes;
  }
  return hashes;
}

function packetFileName(packet: DefenceSourcePacketV1) {
  return `${packet.packetId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
}

async function writeReports(reportDir: string, inventory: ReturnType<typeof buildInventory>) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "crashboard-defence-source-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  await writeFile(path.join(reportDir, "crashboard-defence-source-inventory.md"), inventoryMarkdown(inventory), "utf8");
}

async function main() {
  const mode = (process.argv[2] ?? "inventory") as Mode;
  if (mode !== "inventory" && mode !== "export") throw new Error("Use inventory or export.");
  const root = argument("--root") ?? process.env.TNM_DEFENCE_WIKI_ROOT?.trim();
  if (mode === "export" && !root) throw new Error("Export requires --root or TNM_DEFENCE_WIKI_ROOT.");
  const reportDir = argument("--report-dir") ?? (root ? path.join(root, "outputs") : null);
  const sampleSize = Math.max(5, Math.min(50, Number(argument("--sample-size") ?? 20)));
  const dryRun = flag("--dry-run") || mode === "inventory";

  const universe = await loadUniverse();
  const selection = buildPackets(universe);
  const inventory = buildInventory(universe, selection, sampleSize);
  if (reportDir) await writeReports(reportDir, inventory);

  let written = 0;
  let unchanged = 0;
  let changed = 0;
  let missing = 0;
  if (mode === "export" && root) {
    const rawDir = path.join(root, "raw");
    const existing = await currentPacketHashes(rawDir);
    const selectedFiles = new Set<string>();
    if (!dryRun) await mkdir(rawDir, { recursive: true });
    for (const packet of selection.accepted) {
      const file = packetFileName(packet);
      selectedFiles.add(file);
      const priorHash = existing.get(file);
      if (priorHash === packet.contentHash) {
        unchanged += 1;
        continue;
      }
      if (priorHash) changed += 1;
      if (!dryRun) {
        await writeFile(path.join(rawDir, file), `${JSON.stringify(packet, null, 2)}\n`, "utf8");
        written += 1;
      }
    }
    missing = [...existing.keys()].filter((file) => !selectedFiles.has(file)).length;
  }

  process.stdout.write(`${JSON.stringify({
    mode,
    dryRun,
    packetSchema: DEFENCE_WIKI_PACKET_VERSION,
    selected: selection.accepted.length,
    rejected: selection.rejected.length,
    written,
    changed,
    unchanged,
    missingPriorPackets: missing,
    reportDir,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
