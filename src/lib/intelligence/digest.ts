import type { SupabaseClient } from "@supabase/supabase-js";
import { sendGmailMessage } from "@/lib/intelligence/gmail";
import {
  getGmailSource,
  gmailAccessTokenForSource,
} from "@/lib/intelligence/jobs";
import {
  digestCurrentReach,
  digestPreviousReach,
  digestSignalNarrative,
  digestSignalPassesHistoryGate,
} from "@/lib/intelligence/digest-v2";
import { latestCompleteDateKey, shiftDateKey } from "@/lib/intelligence/signal-metrics";
import { latestSentIntelligenceDigestAt } from "@/lib/intelligence/research-completions";
import {
  hasCompletedIntelligenceV2Backfill,
  intelligenceSignalsV2Enabled,
} from "@/lib/intelligence/v2-readiness";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function digestDate(anchor = new Date()) {
  return anchor.toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
}

type DigestSignal = {
  signal_key: string;
  signal_id: string;
  signal_kind: string;
  signal_label: string;
  direction: "new" | "rising" | "sustained" | "cooling";
  evidence_strength: "strong" | "moderate" | "early";
  raw_reach: number;
  supporting_items: number;
  unique_stories: number;
  independent_source_count: number;
  unique_action_count: number;
  hidden_rank_score: number;
  signal_date: string;
  metadata: Record<string, unknown> | null;
};

type DigestResearchResult = {
  id: string;
  signal_id: string;
  signal_kind: string;
  what_changed: string;
  why_now: string;
  why_it_matters: string;
  what_to_watch: string;
  evidence_effect: string;
  sources: unknown;
  created_at: string;
  intelligence_research_leads:
    | { signal_label?: string | null }
    | Array<{ signal_label?: string | null }>
    | null;
};

function percent(value: number) {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}


function resultLabel(result: DigestResearchResult) {
  const lead = Array.isArray(result.intelligence_research_leads)
    ? result.intelligence_research_leads[0]
    : result.intelligence_research_leads;
  return lead?.signal_label?.trim() || result.signal_id;
}

function sourceLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((source) => {
      if (!source || typeof source !== "object") return null;
      const row = source as Record<string, unknown>;
      if (typeof row.url !== "string" || !/^https?:\/\//iu.test(row.url)) return null;
      return {
        url: row.url,
        title:
          typeof row.title === "string" && row.title.trim()
            ? row.title.trim()
            : new URL(row.url).hostname,
      };
    })
    .filter((source): source is { url: string; title: string } => Boolean(source));
}

export async function createAndSendIntelligenceDigest(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
) {
  const date = digestDate(anchor);
  const since = new Date(anchor);
  since.setUTCDate(since.getUTCDate() - 1);
  const lastDigestAt = await latestSentIntelligenceDigestAt(admin, ownerId);

  const [alertsResult, trendsResult, eventsResult] = await Promise.all([
    admin
      .from("intelligence_alerts")
      .select("id,severity,title,summary,created_at")
      .eq("owner_id", ownerId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("intelligence_trend_snapshots")
      .select("trend_label,trend_strength,momentum,event_count,independent_source_count,period_end")
      .eq("owner_id", ownerId)
      .order("period_end", { ascending: false })
      .order("trend_strength", { ascending: false })
      .limit(8),
    admin
      .from("intelligence_events")
      .select("id,title,event_type,summary,announced_at,defence_relevance,canada_allied_relevance")
      .eq("owner_id", ownerId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  for (const result of [alertsResult, trendsResult, eventsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const [signalsResult, researchResult, v2BackfillReady] = await Promise.all([
    admin
      .from("intelligence_signal_daily")
      .select(
        "signal_key,signal_id,signal_kind,signal_label,direction,evidence_strength,raw_reach,supporting_items,unique_stories,independent_source_count,unique_action_count,hidden_rank_score,signal_date,metadata",
      )
      .eq("owner_id", ownerId)
      .order("signal_date", { ascending: false })
      .order("hidden_rank_score", { ascending: false })
      .limit(250),
    admin
      .from("intelligence_research_results")
      .select(
        "id,signal_id,what_changed,why_now,why_it_matters,what_to_watch,evidence_effect,sources,created_at,intelligence_research_leads(signal_label)",
      )
      .eq("owner_id", ownerId)
      .gt("created_at", lastDigestAt ?? "1970-01-01T00:00:00.000Z")
      .order("created_at", { ascending: false })
      .limit(8),
    intelligenceSignalsV2Enabled()
      ? hasCompletedIntelligenceV2Backfill(admin, ownerId)
      : Promise.resolve(false),
  ]);

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const alerts = alertsResult.data ?? [];
  const trends = trendsResult.data ?? [];
  const events = eventsResult.data ?? [];
  const allSignals = signalsResult.error ? [] : ((signalsResult.data ?? []) as DigestSignal[]);
  const latestSignalDate = allSignals[0]?.signal_date;
  const latestSignals = latestSignalDate
    ? allSignals.filter((signal) => signal.signal_date === latestSignalDate)
    : [];
  const topSignals = latestSignals
    .filter((signal) => signal.evidence_strength !== "early")
    .filter(digestSignalPassesHistoryGate)
    .slice(0, 3);
  const newSignals = latestSignals
    .filter((signal) => signal.direction === "new")
    .filter(digestSignalPassesHistoryGate)
    .slice(0, 5);
  const coolingSignals = latestSignals
    .filter((signal) => signal.direction === "cooling")
    .filter(digestSignalPassesHistoryGate)
    .slice(0, 5);
  const research = researchResult.error
    ? []
    : ((researchResult.data ?? []) as unknown as DigestResearchResult[]);
  const useV2 = intelligenceSignalsV2Enabled() &&
    v2BackfillReady &&
    latestSignalDate === latestCompleteDateKey(anchor) &&
    topSignals.length > 0;
  const signalIds = [...new Set(topSignals.map((signal) => signal.signal_id))];
  const signalKeys = [...new Set(topSignals.map((signal) => signal.signal_key))];
  const [signalResearchResult, supportingRowsResult] = useV2
    ? await Promise.all([
        admin
          .from("intelligence_research_results")
          .select("id,signal_id,signal_kind,why_now,why_it_matters,what_to_watch,sources,created_at")
          .eq("owner_id", ownerId)
          .in("signal_id", signalIds)
          .order("created_at", { ascending: false })
          .limit(100),
        admin
          .from("intelligence_signal_daily")
          .select("signal_key,metadata,signal_date")
          .eq("owner_id", ownerId)
          .in("signal_key", signalKeys)
          .gte("signal_date", shiftDateKey(latestSignalDate!, -27))
          .lte("signal_date", latestSignalDate!)
          .order("signal_date", { ascending: false })
          .limit(500),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const latestResearchBySignal = new Map<string, DigestResearchResult>();
  if (!signalResearchResult.error) {
    for (const row of signalResearchResult.data ?? []) {
      const typed = row as unknown as DigestResearchResult;
      const key = `${typed.signal_kind}:${typed.signal_id}`;
      if (!latestResearchBySignal.has(key)) latestResearchBySignal.set(key, typed);
    }
  }
  const documentIdsBySignal = new Map<string, string[]>();
  if (!supportingRowsResult.error) {
    for (const row of supportingRowsResult.data ?? []) {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const ids = Array.isArray(metadata.documentIds)
        ? metadata.documentIds.filter((id): id is string => typeof id === "string")
        : [];
      const key = String(row.signal_key);
      documentIdsBySignal.set(key, [...new Set([...(documentIdsBySignal.get(key) ?? []), ...ids])]);
    }
  }
  const allDocumentIds = [...new Set([...documentIdsBySignal.values()].flat())].slice(0, 100);
  const documentsResult = useV2 && allDocumentIds.length
    ? await admin
        .from("documents")
        .select("id,title,canonical_url,original_url")
        .eq("owner_id", ownerId)
        .in("id", allDocumentIds)
    : { data: [], error: null };
  const documentsById = new Map((documentsResult.data ?? []).map((document) => [
    String(document.id),
    {
      title: String(document.title ?? "Supporting source"),
      url: String(document.canonical_url ?? document.original_url ?? "") ||
        `${baseUrl}/dashboard/intelligence/documents/${document.id}`,
    },
  ]));
  const signalUrl = (signal: DigestSignal) =>
    `${baseUrl}/dashboard/intelligence/explore?signal=${encodeURIComponent(signal.signal_key)}`;
  const evidenceForSignal = (signal: DigestSignal) => {
    const researchResultForSignal = latestResearchBySignal.get(
      `${signal.signal_kind}:${signal.signal_id}`,
    );
    const researchEvidence = sourceLinks(researchResultForSignal?.sources);
    const documentEvidence = (documentIdsBySignal.get(signal.signal_key) ?? [])
      .flatMap((id) => documentsById.get(id) ?? []);
    return [...new Map(
      [...researchEvidence, ...documentEvidence].map((source) => [source.url, source]),
    ).values()].slice(0, 3);
  };
  const narrativeForSignal = (signal: DigestSignal) => digestSignalNarrative(
    signal,
    latestResearchBySignal.get(`${signal.signal_kind}:${signal.signal_id}`),
  );
  const subject = `Trend Intelligence · ${date}`;
  const legacyTextLines = [
    subject,
    "",
    alerts.length ? "Alerts" : "No new alerts in the last 24 hours.",
    ...alerts.map((alert) => `- ${alert.title}: ${alert.summary}`),
    "",
    "Top trend movements",
    ...trends.map(
      (trend) =>
        `- ${trend.trend_label}: strength ${Math.round(Number(trend.trend_strength))}, ${trend.event_count} events, ${trend.independent_source_count} sources`,
    ),
    "",
    "New evidence-backed events",
    ...events.map((event) => `- ${event.title}: ${event.summary}`),
    "",
    `${baseUrl}/dashboard/intelligence`,
  ];
  const signalText = (signal: DigestSignal) => {
    const narrative = narrativeForSignal(signal);
    return [
      `- ${signal.signal_label} · ${signal.direction} · ${signal.evidence_strength}`,
      `  Now ${percent(digestCurrentReach(signal))} of coverage, previously ${percent(digestPreviousReach(signal))}.`,
      `  Why now: ${narrative.whyNow}`,
      `  Why it matters: ${narrative.whyItMatters}`,
      `  What to watch: ${narrative.whatToWatch}`,
      `  Open signal: ${signalUrl(signal)}`,
      ...evidenceForSignal(signal).map((source) => `  Evidence: ${source.title} — ${source.url}`),
    ];
  };
  const textLines = useV2
    ? [
        subject,
        "",
        "Three things worth attention",
        ...topSignals.flatMap(signalText),
        "",
        "New watch items",
        ...(newSignals.length ? newSignals.map((signal) => `- ${signal.signal_label}`) : ["- None with enough evidence today."]),
        "",
        "Cooling watch items",
        ...(coolingSignals.length ? coolingSignals.map((signal) => `- ${signal.signal_label}`) : ["- None with enough evidence today."]),
        "",
        "Research completed",
        ...(research.length
          ? research.flatMap((result) => [
              `- ${resultLabel(result)}: ${result.what_changed}`,
              `  Why it matters: ${result.why_it_matters}`,
              `  What to watch: ${result.what_to_watch}`,
              ...sourceLinks(result.sources).slice(0, 3).map((source) => `  Evidence: ${source.title} — ${source.url}`),
            ])
          : ["- No research completed since the last brief."]),
        "",
        `${baseUrl}/dashboard/intelligence`,
      ]
    : legacyTextLines;
  const text = textLines.join("\n");
  const signalHtml = (signal: DigestSignal) => {
    const narrative = narrativeForSignal(signal);
    const evidence = evidenceForSignal(signal);
    return `<article style="border-top:1px solid #d6d4cc;padding:16px 0"><p style="margin:0 0 6px;color:#666;font-size:12px;text-transform:uppercase">${escapeHtml(signal.direction)} · ${escapeHtml(signal.evidence_strength)}</p><a href="${escapeHtml(signalUrl(signal))}" style="color:#171719;font-size:18px;font-weight:700">${escapeHtml(signal.signal_label)}</a><p style="line-height:1.55;color:#555">Now ${percent(digestCurrentReach(signal))} of coverage, previously ${percent(digestPreviousReach(signal))}.</p><p style="line-height:1.55"><strong>Why now:</strong> ${escapeHtml(narrative.whyNow)}</p><p style="line-height:1.55"><strong>Why it matters:</strong> ${escapeHtml(narrative.whyItMatters)}</p><p style="line-height:1.55"><strong>What to watch:</strong> ${escapeHtml(narrative.whatToWatch)}</p>${evidence.length ? `<p style="margin:12px 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;color:#666">Evidence</p>${evidence.map((source) => `<p style="margin:6px 0"><a href="${escapeHtml(source.url)}" style="color:#2457d6">${escapeHtml(source.title)}</a></p>`).join("")}` : ""}</article>`;
  };
  const researchHtml = (result: DigestResearchResult) => `<article style="border-top:1px solid #d6d4cc;padding:16px 0"><strong>${escapeHtml(resultLabel(result))}</strong><p style="line-height:1.55;color:#555">${escapeHtml(result.what_changed)}</p><p style="line-height:1.55"><strong>Why it matters:</strong> ${escapeHtml(result.why_it_matters)}</p><p style="line-height:1.55"><strong>What to watch:</strong> ${escapeHtml(result.what_to_watch)}</p>${sourceLinks(result.sources)
    .slice(0, 3)
    .map((source) => `<p style="margin:6px 0"><a href="${escapeHtml(source.url)}" style="color:#2457d6">${escapeHtml(source.title)}</a></p>`)
    .join("")}</article>`;
  const legacyHtml = `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px">Alerts</h2>${
    alerts.length
      ? alerts
          .map(
            (alert) => `<article style="border-top:1px solid #d6d4cc;padding:14px 0"><strong>${escapeHtml(alert.title)}</strong><p style="line-height:1.55;color:#555">${escapeHtml(alert.summary)}</p></article>`,
          )
          .join("")
      : '<p style="color:#666">No new alerts in the last 24 hours.</p>'
  }<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">Top trend movements</h2>${trends
    .map(
      (trend) => `<article style="display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d6d4cc;padding:12px 0"><span>${escapeHtml(String(trend.trend_label))}</span><strong>${Math.round(Number(trend.trend_strength))}/100</strong></article>`,
    )
    .join("")}<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">New events</h2>${events
    .map(
      (event) => `<article style="border-top:1px solid #d6d4cc;padding:14px 0"><strong>${escapeHtml(event.title)}</strong><p style="line-height:1.55;color:#555">${escapeHtml(event.summary)}</p></article>`,
    )
    .join("")}`;
  const v2Html = `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px">Three things worth attention</h2>${topSignals.map(signalHtml).join("")}<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">New this week</h2>${newSignals.length ? newSignals.map((signal) => `<p><a href="${escapeHtml(signalUrl(signal))}" style="color:#2457d6">${escapeHtml(signal.signal_label)}</a></p>`).join("") : '<p style="color:#666">No new signal has enough evidence today.</p>'}<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">Cooling</h2>${coolingSignals.length ? coolingSignals.map((signal) => `<p><a href="${escapeHtml(signalUrl(signal))}" style="color:#2457d6">${escapeHtml(signal.signal_label)}</a></p>`).join("") : '<p style="color:#666">No cooling signal has enough evidence today.</p>'}<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">Research completed</h2>${research.length ? research.map(researchHtml).join("") : '<p style="color:#666">No research completed since the last brief.</p>'}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f6f1;color:#171719;font-family:Arial,sans-serif"><main style="max-width:680px;margin:0 auto;padding:36px 24px"><div style="height:6px;width:92px;background:#2457d6;margin-bottom:28px"></div><p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#666">Crashboard intelligence</p><h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.05;margin:8px 0 24px">${escapeHtml(subject)}</h1>${useV2 ? v2Html : legacyHtml}<a href="${baseUrl}/dashboard/intelligence" style="display:inline-block;margin-top:28px;background:#171719;color:#fff;padding:12px 16px;text-decoration:none">Open Intelligence</a></main></body></html>`;

  const source = await getGmailSource(admin, ownerId);
  if (!source) throw new Error("Connect Gmail before sending the intelligence digest.");
  const { accessToken, email } = await gmailAccessTokenForSource(source);
  const to = process.env.INTELLIGENCE_DIGEST_TO?.trim() || email;
  if (!to) throw new Error("INTELLIGENCE_DIGEST_TO is not configured and Gmail email is unavailable.");

  const digest = await admin
    .from("intelligence_digests")
    .upsert(
      {
        owner_id: ownerId,
        digest_date: date,
        status: "draft",
        subject,
        content_html: html,
        content_text: text,
        alert_ids: alerts.map((alert) => alert.id),
      },
      { onConflict: "owner_id,digest_date" },
    )
    .select("id")
    .single();
  if (digest.error) throw new Error(digest.error.message);

  try {
    const sent = await sendGmailMessage(accessToken, { to, subject, text, html });
    const updated = await admin
      .from("intelligence_digests")
      .update({ status: "sent", gmail_message_id: sent.id, sent_at: new Date().toISOString() })
      .eq("id", digest.data.id);
    if (updated.error) throw new Error(updated.error.message);
    return { digestId: String(digest.data.id), gmailMessageId: sent.id, to };
  } catch (error) {
    await admin
      .from("intelligence_digests")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Digest send failed.",
      })
      .eq("id", digest.data.id);
    throw error;
  }
}
