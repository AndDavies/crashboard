import type { SupabaseClient } from "@supabase/supabase-js";
import { sendGmailMessage } from "@/lib/intelligence/gmail";
import { getGmailSource, gmailAccessTokenForSource } from "@/lib/intelligence/jobs";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "@/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey, shiftDateKey } from "@/lib/intelligence/signal-metrics";
import { intelligenceSignalsV2DataStatus } from "@/lib/intelligence/v2-readiness";

export const MAX_IMMEDIATE_ALERTS_PER_DAY = 2;

export type ImmediateAlertSignal = {
  signal_key: string;
  signal_kind: string;
  signal_id: string;
  signal_label: string;
  direction: "new" | "rising" | "sustained" | "cooling";
  evidence_strength: "strong" | "moderate" | "early";
  raw_reach: number;
  primary_source_count: number;
  unique_action_count: number;
  hidden_rank_score: number;
  metadata: Record<string, unknown> | null;
};

type ImmediateAlertDependencies = {
  sendMessage?: typeof sendGmailMessage;
  getSource?: typeof getGmailSource;
  getAccessToken?: typeof gmailAccessTokenForSource;
  enabled?: boolean;
  getDataStatus?: typeof intelligenceSignalsV2DataStatus;
};

function enabledByEnvironment() {
  return ["1", "true", "on", "yes"].includes(
    process.env.INTELLIGENCE_IMMEDIATE_ALERTS_ENABLED?.trim().toLowerCase() ?? "",
  );
}

function localParts(anchor: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(anchor);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = localParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

export function halifaxDayBounds(anchor = new Date()) {
  const timeZone = "America/Halifax";
  const date = localParts(anchor, timeZone);
  const nextCalendarDay = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const start = zonedMidnightUtc(date.year, date.month, date.day, timeZone);
  const end = zonedMidnightUtc(
    nextCalendarDay.getUTCFullYear(),
    nextCalendarDay.getUTCMonth() + 1,
    nextCalendarDay.getUTCDate(),
    timeZone,
  );
  const dateKey = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  return { dateKey, start: start.toISOString(), end: end.toISOString() };
}

function summaryNumber(signal: ImmediateAlertSignal, key: string, fallback: number) {
  const summary = signal.metadata?.summary;
  const value = summary && typeof summary === "object" && !Array.isArray(summary)
    ? Number((summary as Record<string, unknown>)[key])
    : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

function actionCount(signal: ImmediateAlertSignal) {
  return summaryNumber(signal, "actions", Number(signal.unique_action_count ?? 0));
}

function primarySourceCount(signal: ImmediateAlertSignal) {
  return summaryNumber(signal, "primary_sources", Number(signal.primary_source_count ?? 0));
}

function currentReach(signal: ImmediateAlertSignal) {
  return summaryNumber(signal, "current_reach", Number(signal.raw_reach ?? 0));
}

function previousReach(signal: ImmediateAlertSignal) {
  return summaryNumber(signal, "previous_reach", 0);
}

function qualifies(signal: ImmediateAlertSignal) {
  return signal.evidence_strength === "strong" &&
    (signal.direction === "new" || signal.direction === "rising") &&
    (primarySourceCount(signal) > 0 || actionCount(signal) > 0);
}

export function selectImmediateAlertSignals(
  signals: ImmediateAlertSignal[],
  alreadyClaimedSignalKeys: Iterable<string> = [],
  limit = MAX_IMMEDIATE_ALERTS_PER_DAY,
) {
  const claimed = new Set(alreadyClaimedSignalKeys);
  const unique = new Map<string, ImmediateAlertSignal>();
  for (const signal of signals) {
    if (!qualifies(signal) || claimed.has(signal.signal_key) || unique.has(signal.signal_key)) continue;
    unique.set(signal.signal_key, signal);
  }
  return [...unique.values()]
    .sort((left, right) =>
      Number(right.hidden_rank_score) - Number(left.hidden_rank_score) ||
      left.signal_key.localeCompare(right.signal_key),
    )
    .slice(0, Math.max(0, Math.min(limit, MAX_IMMEDIATE_ALERTS_PER_DAY)));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function percentage(value: number) {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

function explanation(signal: ImmediateAlertSignal) {
  const direct = signal.metadata?.why_it_matters;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const actions = actionCount(signal);
  if (actions > 0) {
    return `${actions} distinct real-world action${actions === 1 ? "" : "s"} support this movement.`;
  }
  return "A primary source now supports this movement.";
}

function messageFor(signal: ImmediateAlertSignal) {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/$/u, "");
  const url = `${baseUrl}/dashboard/intelligence/explore?signal=${encodeURIComponent(signal.signal_key)}`;
  const subject = `Crashboard signal: ${signal.signal_label}`;
  const text = [
    `${signal.signal_label} is ${signal.direction}.`,
    `Now ${percentage(currentReach(signal))} of coverage, previously ${percentage(previousReach(signal))}.`,
    `Why it matters: ${explanation(signal)}`,
    "",
    url,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#171719"><main style="max-width:640px;margin:0 auto;padding:28px"><p style="font-size:12px;text-transform:uppercase;color:#666">Strong ${escapeHtml(signal.direction)} signal</p><h1 style="font-family:Georgia,serif">${escapeHtml(signal.signal_label)}</h1><p>Now ${percentage(currentReach(signal))} of coverage, previously ${percentage(previousReach(signal))}.</p><p><strong>Why it matters:</strong> ${escapeHtml(explanation(signal))}</p><p><a href="${escapeHtml(url)}">Review the evidence in Crashboard</a></p></main></body></html>`;
  return { subject, text, html };
}

async function recordDeliveryRun(
  admin: SupabaseClient,
  ownerId: string,
  signal: ImmediateAlertSignal,
  status: "completed" | "failed",
  input: { gmailMessageId?: string; error?: string },
) {
  const timestamp = new Date().toISOString();
  const result = await admin.from("intelligence_runs").insert({
    owner_id: ownerId,
    run_type: "digest",
    status,
    processed_count: status === "completed" ? 1 : 0,
    failed_count: status === "failed" ? 1 : 0,
    checkpoint_after: {
      delivery_type: "immediate_alert",
      signal_key: signal.signal_key,
      gmail_message_id: input.gmailMessageId ?? null,
    },
    error_summary: input.error ?? null,
    started_at: timestamp,
    heartbeat_at: timestamp,
    completed_at: timestamp,
  });
  if (result.error) console.error("[intelligence] Could not record immediate-alert delivery.", result.error);
}

export async function sendImmediateIntelligenceAlerts(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
  dependencies: ImmediateAlertDependencies = {},
) {
  const enabled = dependencies.enabled ?? enabledByEnvironment();
  if (!enabled) return { skipped: true, reason: "Immediate alerts are disabled.", sent: 0 };

  const dataStatus = await (dependencies.getDataStatus ?? intelligenceSignalsV2DataStatus)(
    admin,
    ownerId,
  );
  if (dataStatus !== "ready") {
    return {
      skipped: true,
      reason: `Canonical v2 signals are ${dataStatus}; immediate alerts stayed off.`,
      sent: 0,
    };
  }

  const latest = await admin
    .from("intelligence_signal_daily")
    .select("signal_date")
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .order("signal_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  if (!latest.data?.signal_date) return { skipped: true, reason: "No v2 signals are available.", sent: 0 };
  if (latest.data.signal_date !== latestCompleteDateKey(anchor)) {
    return {
      skipped: true,
      reason: "The current complete-day v2 signal series is not ready.",
      sent: 0,
    };
  }

  const signals = await admin
    .from("intelligence_signal_daily")
    .select("signal_key,signal_kind,signal_id,signal_label,direction,evidence_strength,raw_reach,primary_source_count,unique_action_count,hidden_rank_score,metadata")
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .eq("signal_date", latest.data.signal_date)
    .eq("evidence_strength", "strong")
    .in("direction", ["new", "rising"])
    .order("hidden_rank_score", { ascending: false })
    .order("signal_key", { ascending: true })
    .limit(50);
  if (signals.error) throw new Error(signals.error.message);

  const signalRows = (signals.data ?? []) as ImmediateAlertSignal[];
  const signalKeys = [...new Set(signalRows.map((signal) => signal.signal_key))];
  const primarySupport = signalKeys.length
    ? await admin
      .from("intelligence_signal_daily")
      .select("signal_key,primary_source_count")
      .eq("owner_id", ownerId)
      .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
      .gte("signal_date", shiftDateKey(latest.data.signal_date, -27))
      .lte("signal_date", latest.data.signal_date)
      .in("signal_key", signalKeys)
    : { data: [], error: null };
  if (primarySupport.error) throw new Error(primarySupport.error.message);
  const currentPeriodPrimarySources = new Map<string, number>();
  for (const row of primarySupport.data ?? []) {
    const key = String(row.signal_key);
    currentPeriodPrimarySources.set(
      key,
      Math.max(currentPeriodPrimarySources.get(key) ?? 0, Number(row.primary_source_count ?? 0)),
    );
  }
  const signalsWithPeriodSupport = signalRows.map((signal) => ({
    ...signal,
    metadata: {
      ...(signal.metadata ?? {}),
      summary: {
        ...(signal.metadata?.summary && typeof signal.metadata.summary === "object" &&
          !Array.isArray(signal.metadata.summary)
          ? signal.metadata.summary as Record<string, unknown>
          : {}),
        primary_sources: currentPeriodPrimarySources.get(signal.signal_key) ?? 0,
      },
    },
  }));

  const day = halifaxDayBounds(anchor);
  const keyPrefix = `immediate-v2:${day.dateKey}:`;
  const existing = await admin
    .from("intelligence_alerts")
    .select("dedupe_key")
    .eq("owner_id", ownerId)
    .like("dedupe_key", `${keyPrefix}%`)
    .gte("created_at", day.start)
    .lt("created_at", day.end)
    .limit(MAX_IMMEDIATE_ALERTS_PER_DAY);
  if (existing.error) throw new Error(existing.error.message);
  const claimedKeys = (existing.data ?? []).map((row) =>
    String(row.dedupe_key).slice(keyPrefix.length),
  );
  const remaining = MAX_IMMEDIATE_ALERTS_PER_DAY - claimedKeys.length;
  const candidates = selectImmediateAlertSignals(
    signalsWithPeriodSupport,
    claimedKeys,
    remaining,
  );
  if (!candidates.length) {
    return { skipped: true, reason: remaining <= 0 ? "Daily alert limit reached." : "No qualifying strong signal.", sent: 0 };
  }

  const getSource = dependencies.getSource ?? getGmailSource;
  const getAccessToken = dependencies.getAccessToken ?? gmailAccessTokenForSource;
  const sendMessage = dependencies.sendMessage ?? sendGmailMessage;
  const gmailSource = await getSource(admin, ownerId);
  if (!gmailSource) throw new Error("Connect Gmail before enabling immediate intelligence alerts.");
  const { accessToken, email } = await getAccessToken(gmailSource);
  const to = process.env.INTELLIGENCE_DIGEST_TO?.trim() || email;
  if (!to) throw new Error("INTELLIGENCE_DIGEST_TO is not configured and Gmail email is unavailable.");

  let sent = 0;
  const delivered: string[] = [];
  for (const signal of candidates) {
    const dedupeKey = `${keyPrefix}${signal.signal_key}`;
    const claim = await admin
      .from("intelligence_alerts")
      .insert({
        owner_id: ownerId,
        severity: "urgent",
        title: `${signal.signal_label} is ${signal.direction}`,
        summary: explanation(signal),
        dedupe_key: dedupeKey,
      })
      .select("id")
      .maybeSingle();
    if (claim.error?.code === "23505") continue;
    if (claim.error) throw new Error(claim.error.message);
    if (!claim.data?.id) continue;

    try {
      const message = messageFor(signal);
      const result = await sendMessage(accessToken, { to, ...message });
      sent += 1;
      delivered.push(signal.signal_key);
      await recordDeliveryRun(admin, ownerId, signal, "completed", { gmailMessageId: result.id });
    } catch (error) {
      await admin
        .from("intelligence_alerts")
        .delete()
        .eq("id", claim.data.id)
        .eq("owner_id", ownerId);
      const message = error instanceof Error ? error.message : "Immediate alert send failed.";
      await recordDeliveryRun(admin, ownerId, signal, "failed", { error: message });
    }
  }

  return { skipped: false, sent, signalKeys: delivered, dailyLimit: MAX_IMMEDIATE_ALERTS_PER_DAY };
}

export const __testables = {
  actionCount,
  primarySourceCount,
  currentReach,
  explanation,
  messageFor,
  qualifies,
};
