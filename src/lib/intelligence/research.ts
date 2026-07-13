import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSourceAdapter, type CollectionSourceRow } from "@/lib/intelligence/collectors";
import { processIntelligenceDocument } from "@/lib/intelligence/pipeline";
import { normalizeSourceUrl } from "@/lib/intelligence/source-url";

export const INTELLIGENCE_RESEARCH_MODEL =
  process.env.OPENAI_INTELLIGENCE_RESEARCH_MODEL?.trim() || "gpt-5.6-terra";

export const RESEARCH_LIMITS = {
  automaticLeadsPerDay: 5,
  searchesPerLead: 4,
  retainedUrlsPerSearch: 5,
  fetchedPagesPerDay: 100,
  estimatedDailyBudgetUsd: 5,
  transientRetries: 2,
  signalCooldownDays: 7,
  maxOutputTokensPerPass: 1_200,
} as const;

const OFFICIAL_RESEARCH_DOMAINS = [
  "canada.ca",
  "open.canada.ca",
  "canadabuys.canada.ca",
  "defense.gov",
  "nato.int",
  "ncia.nato.int",
  "nspa.nato.int",
  "gov.uk",
  "find-tender.service.gov.uk",
  "ted.europa.eu",
  "europa.eu",
] as const;

const ResearchClaimSchema = z
  .object({
    claim: z.string().min(1).max(1_200),
    support: z.enum(["supported", "partial", "unsupported", "unknown"]),
    sourceUrls: z.array(z.string().url()).max(8),
  })
  .strict();

const ResearchSynthesisSchema = z
  .object({
    assessment: z.enum(["supported", "mixed", "unsupported", "unknown"]),
    whatChanged: z.string().max(1_600),
    whyNow: z.string().max(1_600),
    whyItMatters: z.string().max(1_600),
    whatToWatch: z.string().max(1_600),
    evidenceEffect: z.enum(["strengthened", "weakened", "unchanged"]),
    claims: z.array(ResearchClaimSchema).max(16),
  })
  .strict();

const OfficialFindingsSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            claim: z.string().min(1).max(1_000),
            date: z.string().max(40),
            organization: z.string().max(240),
            amount: z.string().max(120),
            milestone: z.string().max(500),
            sourceUrls: z.array(z.string().url()).max(6),
          })
          .strict(),
      )
      .max(16),
    gaps: z.array(z.string().max(500)).max(8),
  })
  .strict();

export type IntelligenceResearchSignalKind =
  | "topic"
  | "keyword"
  | "organization"
  | "system"
  | "programme";

export type ResearchLeadRow = {
  id: string;
  owner_id: string;
  signal_kind: IntelligenceResearchSignalKind;
  signal_id: string;
  signal_label: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  trigger_type: "automatic" | "manual";
  reason: string;
  query_context: Record<string, unknown> | null;
  priority: number;
  attempt_count: number;
  created_at: string;
};

type ResearchSource = {
  url: string;
  title: string;
  domain: string;
  primary: boolean;
  citation: boolean;
  fetched: boolean;
  documentId: string | null;
};

type ResponseWithParsed<T> = {
  id: string;
  output: OpenAI.Responses.ResponseOutputItem[];
  output_parsed: T | null;
  usage?: OpenAI.Responses.ResponseUsage | null;
};

export type RunResearchResult = {
  runId: string;
  queued: number;
  completed: number;
  failed: number;
  fetched: number;
  estimatedCostUsd: number;
  errors: string[];
};

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function dailyBudgetUsd() {
  return envNumber("INTELLIGENCE_RESEARCH_DAILY_BUDGET_USD", RESEARCH_LIMITS.estimatedDailyBudgetUsd);
}

function perLeadBudgetReserveUsd() {
  return envNumber("INTELLIGENCE_RESEARCH_MAX_USD_PER_LEAD", 1);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function startOfUtcDay(anchor: Date) {
  const start = new Date(anchor);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function researchInstructions() {
  return `You are Crashboard's evidence analyst. Use web search; do not answer from memory.

Rules:
- Search original government, procurement, alliance, programme, and company sources before commentary.
- Report only claims supported by visible, clickable URL citations.
- Distinguish announcements from analysis and repeated coverage from independent evidence.
- Extract exact dates, amounts, organizations, programme or system names, buyers, and milestones when present.
- Never invent a cause. If the evidence does not establish why activity changed, say the cause is unknown.
- Treat unsupported causal explanations as unknown and unsupported claims as unsupported.
- Explain whether the evidence strengthened, weakened, or did not change the trend assessment.
- Keep the language brief and useful to a decision-maker.`;
}

function researchContext(lead: ResearchLeadRow) {
  const context = lead.query_context ?? {};
  return {
    signal: {
      kind: lead.signal_kind,
      id: lead.signal_id,
      label: lead.signal_label,
      aliases: Array.isArray(context.aliases) ? context.aliases : [],
      organizations: Array.isArray(context.organizations) ? context.organizations : [],
      systems: Array.isArray(context.systems) ? context.systems : [],
      buyers: Array.isArray(context.buyers) ? context.buyers : [],
      actions: Array.isArray(context.actions) ? context.actions : [],
    },
    triggerReason: lead.reason,
    existingExplanation: {
      whyNow: typeof context.why_now === "string" ? context.why_now : "",
      whyItMatters: typeof context.why_it_matters === "string" ? context.why_it_matters : "",
    },
  };
}

async function officialResearch(client: OpenAI, lead: ResearchLeadRow) {
  return client.responses.parse(
    {
      model: INTELLIGENCE_RESEARCH_MODEL,
      reasoning: { effort: "low" },
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
          filters: { allowed_domains: [...OFFICIAL_RESEARCH_DOMAINS] },
        },
      ],
      tool_choice: "required",
      max_tool_calls: 2,
      max_output_tokens: RESEARCH_LIMITS.maxOutputTokensPerPass,
      include: ["web_search_call.action.sources"],
      input: [
        { role: "system", content: researchInstructions() },
        {
          role: "user",
          content: `Search official sources for this signal. Use no more than two searches. Return the strongest concrete evidence and state the gaps.\n\n${JSON.stringify(researchContext(lead))}`,
        },
      ],
      text: { format: zodTextFormat(OfficialFindingsSchema, "official_research_findings") },
    },
    { timeout: 105_000, maxRetries: RESEARCH_LIMITS.transientRetries },
  );
}

async function broadResearch(
  client: OpenAI,
  lead: ResearchLeadRow,
  official: ResponseWithParsed<z.infer<typeof OfficialFindingsSchema>>,
) {
  return client.responses.parse(
    {
      model: INTELLIGENCE_RESEARCH_MODEL,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      max_tool_calls: 2,
      max_output_tokens: RESEARCH_LIMITS.maxOutputTokensPerPass,
      include: ["web_search_call.action.sources"],
      input: [
        { role: "system", content: researchInstructions() },
        {
          role: "user",
          content: `Complete the assessment using up to two broader searches. Prefer independent corroboration and do not repeat the official results as separate stories. Every supported claim must include its source URLs.\n\nSignal:\n${JSON.stringify(researchContext(lead))}\n\nOfficial-source findings:\n${JSON.stringify(official.output_parsed ?? { findings: [], gaps: ["Official pass returned no structured findings."] })}`,
        },
      ],
      text: { format: zodTextFormat(ResearchSynthesisSchema, "research_synthesis") },
    },
    { timeout: 105_000, maxRetries: RESEARCH_LIMITS.transientRetries },
  );
}

function responseSources(response: ResponseWithParsed<unknown>) {
  const sources = new Map<string, { url: string; title: string; citation: boolean }>();
  for (const item of response.output) {
    if (item.type === "web_search_call" && item.action.type === "search") {
      for (const source of item.action.sources ?? []) {
        const url = normalizeSourceUrl(source.url);
        if (url && !sources.has(url)) sources.set(url, { url, title: new URL(url).hostname, citation: false });
      }
    }
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations) {
        if (annotation.type !== "url_citation") continue;
        const url = normalizeSourceUrl(annotation.url);
        if (!url) continue;
        sources.set(url, { url, title: annotation.title || new URL(url).hostname, citation: true });
      }
    }
  }
  return [...sources.values()].slice(0, RESEARCH_LIMITS.retainedUrlsPerSearch);
}

function isPrimaryDomain(domain: string) {
  return OFFICIAL_RESEARCH_DOMAINS.some(
    (official) => domain === official || domain.endsWith(`.${official}`),
  );
}

function estimatedCost(responses: Array<ResponseWithParsed<unknown>>) {
  const inputPerMillion = envNumber("OPENAI_INTELLIGENCE_RESEARCH_INPUT_USD_PER_MILLION", 3);
  const outputPerMillion = envNumber("OPENAI_INTELLIGENCE_RESEARCH_OUTPUT_USD_PER_MILLION", 15);
  const searchCost = envNumber("OPENAI_INTELLIGENCE_RESEARCH_SEARCH_USD", 0.01);
  let inputTokens = 0;
  let outputTokens = 0;
  let searches = 0;
  for (const response of responses) {
    inputTokens += Number(response.usage?.input_tokens ?? 0);
    outputTokens += Number(response.usage?.output_tokens ?? 0);
    searches += response.output.filter((item) => item.type === "web_search_call").length;
  }
  return Number(
    ((inputTokens / 1_000_000) * inputPerMillion +
      (outputTokens / 1_000_000) * outputPerMillion +
      searches * searchCost).toFixed(6),
  );
}

async function usedResearchCapacity(admin: SupabaseClient, ownerId: string, anchor: Date) {
  const since = startOfUtcDay(anchor).toISOString();
  const [runs, results] = await Promise.all([
    admin
      .from("intelligence_runs")
      .select("processed_count")
      .eq("owner_id", ownerId)
      .eq("run_type", "research")
      .gte("created_at", since),
    admin
      .from("intelligence_research_results")
      .select("estimated_cost_usd")
      .eq("owner_id", ownerId)
      .gte("created_at", since),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  if (results.error) throw new Error(results.error.message);
  return {
    fetched: (runs.data ?? []).reduce((total, row) => total + Number(row.processed_count ?? 0), 0),
    estimatedCostUsd: (results.data ?? []).reduce(
      (total, row) => total + Number(row.estimated_cost_usd ?? 0),
      0,
    ),
  };
}

async function researchSourceForUrl(
  admin: SupabaseClient,
  lead: ResearchLeadRow,
  url: string,
): Promise<CollectionSourceRow> {
  const domain = new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  const externalKey = `research:${domain}`;
  const existing = await admin
    .from("intelligence_sources")
    .select(
      "id,owner_id,source_type,name,external_key,status,cohort,measurement_active_from,discovery_origin,triggering_research_lead_id,robots_status,config,checkpoint,last_synced_at,last_successful_fetch_at,fetch_failure_count,fetch_cooldown_until",
    )
    .eq("owner_id", lead.owner_id)
    .eq("source_type", "website")
    .eq("external_key", externalKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const source = existing.data as CollectionSourceRow;
    const urls = [...new Set([...(Array.isArray(source.config?.urls) ? source.config.urls : []), url])].filter(
      (value): value is string => typeof value === "string",
    );
    const update = await admin
      .from("intelligence_sources")
      .update({ config: { ...(source.config ?? {}), urls }, updated_at: new Date().toISOString() })
      .eq("id", source.id)
      .eq("owner_id", lead.owner_id);
    if (update.error) throw new Error(update.error.message);
    return { ...source, config: { ...(source.config ?? {}), urls } };
  }

  const inserted = await admin
    .from("intelligence_sources")
    .insert({
      owner_id: lead.owner_id,
      source_type: "website",
      name: `${domain} research`,
      external_key: externalKey,
      status: "active",
      cohort: "research",
      measurement_active_from: null,
      discovery_origin: "trend_research",
      triggering_research_lead_id: lead.id,
      robots_status: "unknown",
      config: { urls: [url], authority: isPrimaryDomain(domain) ? "official" : "research" },
    })
    .select(
      "id,owner_id,source_type,name,external_key,status,cohort,measurement_active_from,discovery_origin,triggering_research_lead_id,robots_status,config,checkpoint,last_synced_at,last_successful_fetch_at,fetch_failure_count,fetch_cooldown_until",
    )
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data as CollectionSourceRow;
}

async function ingestResearchSource(
  admin: SupabaseClient,
  lead: ResearchLeadRow,
  source: ResearchSource,
) {
  const sourceRow = await researchSourceForUrl(admin, lead, source.url);
  const adapter = createSourceAdapter({ ...sourceRow, config: { ...(sourceRow.config ?? {}), urls: [source.url] } });
  const fetchedDocument = await adapter.fetch(source.url, lead.owner_id);
  // The bounded web-search passes already perform the research extraction.
  // Persist fetched evidence without a second unmetered model call; promoted
  // sources receive normal enrichment on prospective scheduled collections.
  const document = {
    ...fetchedDocument,
    metadata: {
      ...(fetchedDocument.metadata ?? {}),
      research_extraction_pending: true,
    },
  };
  const persisted = await processIntelligenceDocument(admin, document);
  const documentRow = await admin
    .from("documents")
    .select("source_identity_id")
    .eq("owner_id", lead.owner_id)
    .eq("id", persisted.documentId)
    .single();
  if (documentRow.error) throw new Error(documentRow.error.message);
  if (documentRow.data.source_identity_id) {
    const identity = await admin
      .from("intelligence_source_identities")
      .update({ source_id: sourceRow.id, updated_at: new Date().toISOString() })
      .eq("owner_id", lead.owner_id)
      .eq("id", documentRow.data.source_identity_id);
    if (identity.error) throw new Error(identity.error.message);
  }
  await admin
    .from("intelligence_sources")
    .update({
      robots_status: fetchedDocument.metadata?.robots_status ?? "unknown",
      last_successful_fetch_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      last_error: null,
      fetch_failure_count: 0,
      fetch_cooldown_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceRow.id)
    .eq("owner_id", lead.owner_id);
  return persisted.documentId;
}

async function completeLead(
  admin: SupabaseClient,
  lead: ResearchLeadRow,
  capacity: { remainingPages: number },
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey, timeout: 105_000, maxRetries: RESEARCH_LIMITS.transientRetries });
  const official = await officialResearch(client, lead);
  if (!official.output_parsed) throw new Error("Official research did not return structured findings.");
  const broad = await broadResearch(client, lead, official);
  if (!broad.output_parsed) throw new Error("Research did not return a structured assessment.");

  const sourceMap = new Map<string, ResearchSource>();
  for (const source of [...responseSources(official), ...responseSources(broad)]) {
    const domain = new URL(source.url).hostname.toLowerCase().replace(/^www\./u, "");
    const existing = sourceMap.get(source.url);
    sourceMap.set(source.url, {
      url: source.url,
      title: source.title,
      domain,
      primary: isPrimaryDomain(domain),
      citation: source.citation || Boolean(existing?.citation),
      fetched: false,
      documentId: null,
    });
  }

  let fetched = 0;
  for (const source of [...sourceMap.values()].sort((a, b) => Number(b.primary) - Number(a.primary))) {
    if (fetched >= capacity.remainingPages) break;
    try {
      source.documentId = await ingestResearchSource(admin, lead, source);
      source.fetched = true;
      fetched += 1;
    } catch (error) {
      console.warn("[intelligence] Research source fetch was retained as a citation only.", {
        url: source.url,
        error: errorMessage(error),
      });
    }
  }

  const cost = estimatedCost([official, broad]);
  const synthesis = broad.output_parsed;
  const claims = synthesis.claims.map((claim) => {
    const sourceUrls = claim.sourceUrls
      .map((url) => normalizeSourceUrl(url))
      .filter((url): url is string => Boolean(url && sourceMap.has(url)));
    return {
      ...claim,
      sourceUrls,
      support:
        (claim.support === "supported" || claim.support === "partial") && !sourceUrls.length
          ? "unknown"
          : claim.support,
    };
  });
  const result = await admin.from("intelligence_research_results").insert({
    owner_id: lead.owner_id,
    lead_id: lead.id,
    signal_kind: lead.signal_kind,
    signal_id: lead.signal_id,
    assessment: synthesis.assessment,
    what_changed: synthesis.whatChanged,
    why_now: synthesis.whyNow,
    why_it_matters: synthesis.whyItMatters,
    what_to_watch: synthesis.whatToWatch,
    evidence_effect: synthesis.evidenceEffect,
    sources: [...sourceMap.values()],
    claims,
    openai_response_id: broad.id,
    model: INTELLIGENCE_RESEARCH_MODEL,
    estimated_cost_usd: cost,
  });
  if (result.error) throw new Error(result.error.message);
  const completedAt = new Date().toISOString();
  const update = await admin
    .from("intelligence_research_leads")
    .update({
      status: "completed",
      completed_at: completedAt,
      cooldown_until: new Date(Date.now() + RESEARCH_LIMITS.signalCooldownDays * 86_400_000).toISOString(),
      last_error: null,
    })
    .eq("id", lead.id)
    .eq("owner_id", lead.owner_id);
  if (update.error) throw new Error(update.error.message);
  return { fetched, cost };
}

export async function createResearchLead(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    signalKind: IntelligenceResearchSignalKind;
    signalId: string;
    signalLabel: string;
    reason?: string;
    queryContext?: Record<string, unknown>;
    triggerType?: "automatic" | "manual";
    priority?: number;
  },
) {
  const cooldownBoundary = new Date(Date.now() - RESEARCH_LIMITS.signalCooldownDays * 86_400_000).toISOString();
  const active = await admin
    .from("intelligence_research_leads")
    .select("id,status,created_at,cooldown_until")
    .eq("owner_id", input.ownerId)
    .eq("signal_kind", input.signalKind)
    .eq("signal_id", input.signalId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active.error) throw new Error(active.error.message);
  if (active.data) return { lead: active.data, created: false };
  const recent = await admin
    .from("intelligence_research_leads")
    .select("id,status,created_at,cooldown_until")
    .eq("owner_id", input.ownerId)
    .eq("signal_kind", input.signalKind)
    .eq("signal_id", input.signalId)
    .eq("status", "completed")
    .gte("created_at", cooldownBoundary)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent.error) throw new Error(recent.error.message);
  if (recent.data) return { lead: recent.data, created: false };

  const inserted = await admin
    .from("intelligence_research_leads")
    .insert({
      owner_id: input.ownerId,
      signal_kind: input.signalKind,
      signal_id: input.signalId,
      signal_label: input.signalLabel,
      status: "queued",
      trigger_type: input.triggerType ?? "manual",
      reason: input.reason?.trim() || "Manual research request.",
      query_context: input.queryContext ?? {},
      priority: Math.max(0, Math.min(input.priority ?? 50, 100)),
    })
    .select("id,status,created_at,cooldown_until")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return { lead: inserted.data, created: true };
}

export async function createAutomaticResearchLeads(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
) {
  const today = startOfUtcDay(anchor).toISOString();
  const existingToday = await admin
    .from("intelligence_research_leads")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("trigger_type", "automatic")
    .gte("created_at", today);
  if (existingToday.error) throw new Error(existingToday.error.message);
  const remainingDailyLeads = Math.max(
    0,
    RESEARCH_LIMITS.automaticLeadsPerDay - Number(existingToday.count ?? 0),
  );
  if (!remainingDailyLeads) return { created: 0 };
  const latest = await admin
    .from("intelligence_signal_daily")
    .select(
      "signal_kind,signal_id,signal_label,direction,evidence_strength,primary_source_count,unique_action_count,metadata,signal_date,hidden_rank_score",
    )
    .eq("owner_id", ownerId)
    .eq("evidence_strength", "strong")
    .in("direction", ["new", "rising"])
    .lte("signal_date", anchor.toISOString().slice(0, 10))
    .order("signal_date", { ascending: false })
    .order("hidden_rank_score", { ascending: false })
    .limit(30);
  if (latest.error) throw new Error(latest.error.message);
  const unique = new Map<string, (typeof latest.data)[number]>();
  for (const signal of latest.data ?? []) {
    const key = `${signal.signal_kind}:${signal.signal_id}`;
    if (!unique.has(key)) unique.set(key, signal);
  }

  let created = 0;
  for (const signal of unique.values()) {
    if (created >= remainingDailyLeads) break;
    const metadata =
      signal.metadata && typeof signal.metadata === "object" && !Array.isArray(signal.metadata)
        ? (signal.metadata as Record<string, unknown>)
        : {};
    const lacksExplanation = !String(metadata.why_now ?? "").trim();
    if (Number(signal.primary_source_count) > 0 && Number(signal.unique_action_count) > 0 && !lacksExplanation) {
      continue;
    }
    const result = await createResearchLead(admin, {
      ownerId,
      signalKind: signal.signal_kind as IntelligenceResearchSignalKind,
      signalId: String(signal.signal_id),
      signalLabel: String(signal.signal_label),
      triggerType: "automatic",
      priority: 70,
      reason: [
        Number(signal.primary_source_count) === 0 ? "No primary source." : "",
        Number(signal.unique_action_count) === 0 ? "No concrete action evidence." : "",
        lacksExplanation ? "Explanation needs stronger evidence." : "",
      ]
        .filter(Boolean)
        .join(" "),
      queryContext: metadata,
    });
    if (result.created) created += 1;
  }
  return { created };
}

export async function runResearchQueue(
  admin: SupabaseClient,
  ownerId: string,
  options: { anchor?: Date; leadId?: string; createAutomatic?: boolean; maxLeads?: number } = {},
): Promise<RunResearchResult> {
  const anchor = options.anchor ?? new Date();
  const capacity = await usedResearchCapacity(admin, ownerId, anchor);
  if (capacity.estimatedCostUsd >= dailyBudgetUsd()) {
    throw new Error(`Daily research budget of $${dailyBudgetUsd().toFixed(2)} is already allocated.`);
  }
  if (capacity.fetched >= RESEARCH_LIMITS.fetchedPagesPerDay) {
    throw new Error("Daily research fetch limit is already reached.");
  }

  if (options.createAutomatic !== false && !options.leadId) {
    await createAutomaticResearchLeads(admin, ownerId, anchor);
  }
  let query = admin
    .from("intelligence_research_leads")
    .select(
      "id,owner_id,signal_kind,signal_id,signal_label,status,trigger_type,reason,query_context,priority,attempt_count,created_at",
    )
    .eq("owner_id", ownerId)
    .eq("status", "queued");
  if (options.leadId) query = query.eq("id", options.leadId);
  const leadsResult = await query
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(options.maxLeads ?? RESEARCH_LIMITS.automaticLeadsPerDay, 5)));
  if (leadsResult.error) throw new Error(leadsResult.error.message);
  const leads = (leadsResult.data ?? []) as ResearchLeadRow[];
  const startedAt = anchor.toISOString();
  const run = await admin
    .from("intelligence_runs")
    .insert({
      owner_id: ownerId,
      run_type: "research",
      status: "running",
      discovered_count: leads.length,
      started_at: startedAt,
      heartbeat_at: startedAt,
      checkpoint_before: { lead_ids: leads.map((lead) => lead.id) },
    })
    .select("id")
    .single();
  if (run.error) throw new Error(run.error.message);
  const runId = String(run.data.id);
  let completed = 0;
  let failed = 0;
  let fetched = 0;
  let cost = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    // Reserve a fixed ceiling before the first request so the final lead cannot
    // consume the remainder and push the day's estimated spend past the cap.
    if (
      capacity.estimatedCostUsd + cost + perLeadBudgetReserveUsd() >
      dailyBudgetUsd()
    ) {
      break;
    }
    const claimed = await admin
      .from("intelligence_research_leads")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        attempt_count: Number(lead.attempt_count ?? 0) + 1,
        last_error: null,
      })
      .eq("id", lead.id)
      .eq("owner_id", ownerId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) continue;
    try {
      const result = await completeLead(admin, lead, {
        remainingPages: Math.max(0, RESEARCH_LIMITS.fetchedPagesPerDay - capacity.fetched - fetched),
      });
      completed += 1;
      fetched += result.fetched;
      cost += result.cost;
    } catch (error) {
      failed += 1;
      const message = errorMessage(error);
      errors.push(`${lead.signal_label}: ${message}`);
      await admin
        .from("intelligence_research_leads")
        .update({ status: "failed", completed_at: new Date().toISOString(), last_error: message })
        .eq("id", lead.id)
        .eq("owner_id", ownerId);
    }
    await admin
      .from("intelligence_runs")
      .update({
        processed_count: fetched,
        failed_count: failed,
        estimated_cost_usd: cost,
        error_summary: errors.slice(0, 5).join("\n") || null,
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }

  const completedAt = new Date().toISOString();
  const finish = await admin
    .from("intelligence_runs")
    .update({
      status: failed ? (completed ? "partial" : "failed") : "completed",
      processed_count: fetched,
      failed_count: failed,
      estimated_cost_usd: cost,
      checkpoint_after: { completed, failed, fetched },
      error_summary: errors.slice(0, 5).join("\n") || null,
      heartbeat_at: completedAt,
      completed_at: completedAt,
    })
    .eq("id", runId);
  if (finish.error) throw new Error(finish.error.message);
  return { runId, queued: leads.length, completed, failed, fetched, estimatedCostUsd: cost, errors: errors.slice(0, 5) };
}

export async function promoteResearchSource(
  admin: SupabaseClient,
  ownerId: string,
  sourceId: string,
  anchor = new Date(),
) {
  const existing = await admin
    .from("intelligence_sources")
    .select("id,name,cohort,status")
    .eq("owner_id", ownerId)
    .eq("id", sourceId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("Source not found.");
  const activeFrom = anchor.toISOString();
  const updated = await admin
    .from("intelligence_sources")
    .update({
      cohort: "measurement",
      measurement_active_from: activeFrom,
      status: "active",
      updated_at: activeFrom,
    })
    .eq("owner_id", ownerId)
    .eq("id", sourceId)
    .select("id,name,cohort,measurement_active_from,status")
    .single();
  if (updated.error) throw new Error(updated.error.message);
  const identities = await admin
    .from("intelligence_source_identities")
    .update({ updated_at: activeFrom })
    .eq("owner_id", ownerId)
    .eq("source_id", sourceId);
  if (identities.error) throw new Error(identities.error.message);
  return updated.data;
}

export const __testables = {
  responseSources,
  estimatedCost,
  isPrimaryDomain,
  perLeadBudgetReserveUsd,
};
