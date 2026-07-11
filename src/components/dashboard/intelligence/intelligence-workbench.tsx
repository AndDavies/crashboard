"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bell,
  Database,
  Mail,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT_TYPE_LABELS } from "@/lib/intelligence/taxonomy";
import {
  parseFullBackfillBatchResponse,
  runFullBackfillBatches,
  type FullBackfillProgress,
} from "@/lib/intelligence/full-backfill";
import type { IntelligenceDashboardData } from "@/lib/intelligence/types";
import { cn } from "@/lib/utils";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function readableDate(value: string | null) {
  if (!value) return "Not yet synced";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Halifax",
  }).format(new Date(value));
}

function runTimestamp(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Halifax",
  }).format(new Date(value));
}

function elapsedLabel(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function batchCountLabel(count: number) {
  return `${count} ${count === 1 ? "batch" : "batches"}`;
}

function runStatusVariant(status: string, isStale: boolean) {
  if (isStale || status === "failed" || status === "cancelled") return "destructive" as const;
  if (status === "completed") return "default" as const;
  if (status === "partial") return "secondary" as const;
  return "outline" as const;
}

type ActionFeedback = {
  kind: "success" | "error";
  message: string;
  savedAt: number;
};

const ACTION_FEEDBACK_KEY = "crashboard:intelligence-action-feedback";
const ACTION_FEEDBACK_MAX_AGE_MS = 15 * 60 * 1000;
const FULL_BACKFILL_BATCH_PAUSE_MS = 750;

async function postAction(
  endpoint: string,
  body: Record<string, unknown> = {},
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    result?: Record<string, unknown>;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `Action failed (HTTP ${response.status}).`);
  }
  return payload;
}

function TrendLineChart({ data }: { data: IntelligenceDashboardData["trendSeries"] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center border border-dashed border-border bg-muted/15 px-6 text-center text-sm text-muted-foreground">
        At least two completed trend snapshots are needed to draw movement over time.
      </div>
    );
  }
  const width = 760;
  const height = 230;
  const pad = { left: 42, right: 16, top: 18, bottom: 38 };
  const max = Math.max(...data.flatMap((point) => [point.eventRate, point.mentionRate]), 1);
  const x = (index: number) =>
    pad.left + (index / Math.max(1, data.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
  const eventPoints = data.map((point, index) => `${x(index)},${y(point.eventRate)}`).join(" ");
  const mentionPoints = data
    .map((point, index) => `${x(index)},${y(point.mentionRate)}`)
    .join(" ");

  return (
    <div className="overflow-x-auto" role="img" aria-label="Event and mention rates over time">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px]" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const gridY = pad.top + ratio * (height - pad.top - pad.bottom);
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={gridY}
                y2={gridY}
                stroke="currentColor"
                className="text-border"
                strokeWidth="1"
              />
              <text x="2" y={gridY + 4} className="fill-muted-foreground font-mono text-[10px]">
                {(max * (1 - ratio)).toFixed(1)}
              </text>
            </g>
          );
        })}
        <polyline
          points={mentionPoints}
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <polyline
          points={eventPoints}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
        />
        {data.map((point, index) => (
          <g key={point.period}>
            <circle cx={x(index)} cy={y(point.eventRate)} r="4" fill="var(--accent)" />
            {(index === 0 || index === data.length - 1 || index % 3 === 0) && (
              <text
                x={x(index)}
                y={height - 12}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[9px]"
              >
                {point.period.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 bg-accent" /> Event rate
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 border-t-2 border-dashed border-muted-foreground" /> Mention rate
        </span>
        <span>Per 100 source documents</span>
      </div>
    </div>
  );
}

function RankedBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No records yet.</p>;
  }
  return (
    <div className="space-y-4">
      {rows.slice(0, 8).map((row) => (
        <div key={row.label}>
          <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
            <span className="capitalize text-foreground">{row.label}</span>
            <span className="font-mono text-muted-foreground">{row.count}</span>
          </div>
          <div className="h-2 bg-muted">
            <div
              className="h-full bg-foreground"
              style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="grid grid-cols-[1fr_auto] items-start">
        <div>
          <CardDescription className="editorial-kicker">{label}</CardDescription>
          <CardTitle className="mt-2 font-mono text-3xl font-semibold">{value}</CardTitle>
        </div>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function SetupState({ data }: { data: IntelligenceDashboardData }) {
  if (data.status === "schema_missing") {
    return (
      <div className="border border-amber-600/40 bg-amber-500/10 p-5">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 text-amber-700" />
          <div>
            <h2 className="font-heading text-lg font-semibold">Database migration required</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Apply the Trend Intelligence Supabase migration before running the backfill. The UI is
              installed, but private event, source, trend, and watchlist tables are not available yet.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (!data.configuration.gmailConnected) {
    return (
      <div className="border border-border bg-card p-5">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="editorial-kicker">Source setup</p>
            <h2 className="mt-2 font-heading text-xl font-semibold">Connect the read-only Gmail source</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              The workbench never archives, labels, deletes, or changes read state. Gmail send access is
              used only for the daily intelligence digest.
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<a href="/api/intelligence/google/start" />}
            disabled={
              !data.configuration.gmailOAuthConfigured ||
              !data.configuration.tokenEncryptionConfigured
            }
          >
            <Mail className="size-4" /> Connect Gmail
          </Button>
        </div>
        {!data.configuration.gmailOAuthConfigured ||
        !data.configuration.tokenEncryptionConfigured ? (
          <p className="mt-4 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
            Configure GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, and
            INTELLIGENCE_TOKEN_ENCRYPTION_KEY to enable OAuth.
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}

export function IntelligenceWorkbench({ data }: { data: IntelligenceDashboardData }) {
  const router = useRouter();
  const [action, setAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [fullBackfillProgress, setFullBackfillProgress] =
    useState<FullBackfillProgress | null>(null);
  const [fullBackfillStopRequested, setFullBackfillStopRequested] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState<{
    complete: number;
    total: number;
    failed: number;
  } | null>(null);
  const [reprocessConfirmationPending, setReprocessConfirmationPending] =
    useState(false);
  const fullBackfillStopRef = useRef(false);
  const actionRunningRef = useRef(false);
  const topTrend = data.trends[0];
  const freshness = data.coverage.lastSyncedAt
    ? Math.max(
        0,
        Math.round((Date.now() - new Date(data.coverage.lastSyncedAt).getTime()) / 3_600_000),
      )
    : null;
  const analyticsFreshness = data.coverage.analyticsComputedAt
    ? Math.max(
        0,
        Math.round((Date.now() - new Date(data.coverage.analyticsComputedAt).getTime()) / 3_600_000),
      )
    : null;

  const configurationReady = useMemo(
    () =>
      data.status === "ready" &&
      data.configuration.gmailConnected &&
      data.configuration.openaiConfigured,
    [data],
  );

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(ACTION_FEEDBACK_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<ActionFeedback>;
      if (
        (parsed.kind === "success" || parsed.kind === "error") &&
        typeof parsed.message === "string" &&
        typeof parsed.savedAt === "number" &&
        Date.now() - parsed.savedAt <= ACTION_FEEDBACK_MAX_AGE_MS
      ) {
        setFeedback(parsed as ActionFeedback);
      } else {
        window.sessionStorage.removeItem(ACTION_FEEDBACK_KEY);
      }
    } catch {
      window.sessionStorage.removeItem(ACTION_FEEDBACK_KEY);
    }
  }, []);

  useEffect(
    () => () => {
      fullBackfillStopRef.current = true;
    },
    [],
  );

  function saveFeedback(kind: ActionFeedback["kind"], message: string) {
    const next = { kind, message, savedAt: Date.now() } satisfies ActionFeedback;
    setFeedback(next);
    window.sessionStorage.setItem(ACTION_FEEDBACK_KEY, JSON.stringify(next));
  }

  async function runAction(
    name: string,
    endpoint: string,
    body: Record<string, unknown> = {},
  ) {
    if (actionRunningRef.current) return;
    setReprocessConfirmationPending(false);
    actionRunningRef.current = true;
    setAction(name);
    setFeedback(null);
    window.sessionStorage.removeItem(ACTION_FEEDBACK_KEY);
    try {
      const result = await postAction(endpoint, body);
      saveFeedback(
        "success",
        name === "digest"
          ? "Daily intelligence digest sent."
          : name === "trends"
            ? [
                `${String(result.result?.snapshotCount ?? 0)} trend snapshots refreshed`,
                result.result?.periodStart && result.result?.periodEnd
                  ? `${String(result.result.periodStart)} to ${String(result.result.periodEnd)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
          : [
              `${String(result.result?.discovered ?? 0)} discovered`,
              `${String(result.result?.processed ?? 0)} processed`,
              `${String(result.result?.failed ?? 0)} failed`,
              `${String(result.result?.excluded ?? 0)} excluded`,
              result.result?.hasMore ? "more remain in the checkpoint" : "checkpoint complete",
            ].join(" · "),
      );
      router.refresh();
    } catch (error) {
      saveFeedback("error", error instanceof Error ? error.message : "Action failed.");
      router.refresh();
    } finally {
      actionRunningRef.current = false;
      setAction(null);
    }
  }

  function requestFullBackfillStop() {
    fullBackfillStopRef.current = true;
    setFullBackfillStopRequested(true);
  }

  async function runFullBackfill() {
    if (actionRunningRef.current) return;
    const confirmed = window.confirm(
      "Run every remaining backfill batch? This may take a long time and consume OpenAI API usage. Keep this tab open; progress is safely checkpointed after every batch.",
    );
    if (!confirmed) return;
    actionRunningRef.current = true;

    const initialProgress: FullBackfillProgress = {
      batches: 0,
      processed: 0,
      failedAttempts: 0,
      excluded: 0,
      pending: 0,
      deadLettered: 0,
      complete: false,
      stopped: false,
      lastRunId: null,
    };
    let latestProgress = initialProgress;
    fullBackfillStopRef.current = false;
    setFullBackfillStopRequested(false);
    setFullBackfillProgress(initialProgress);
    setAction("full-backfill");
    setFeedback(null);
    window.sessionStorage.removeItem(ACTION_FEEDBACK_KEY);

    try {
      const result = await runFullBackfillBatches({
        runBatch: async () =>
          parseFullBackfillBatchResponse(
            await postAction("/api/intelligence/sync", {
              mode: "backfill",
              maxMessages: 25,
            }),
          ),
        shouldStop: () => fullBackfillStopRef.current,
        onProgress: (progress) => {
          latestProgress = progress;
          setFullBackfillProgress(progress);
        },
        waitBetweenBatches: () =>
          new Promise((resolve) => {
            window.setTimeout(resolve, FULL_BACKFILL_BATCH_PAUSE_MS);
          }),
      });

      if (result.stopped) {
        saveFeedback(
          "success",
          `Full backfill stopped safely after ${batchCountLabel(result.batches)} · ${result.processed} processed · ${result.failedAttempts} failed attempts · checkpoint saved. Run Full Backfill again to resume.`,
        );
      } else {
        await postAction("/api/intelligence/trends");
        saveFeedback(
          "success",
          `Full backfill complete · ${batchCountLabel(result.batches)} · ${result.processed} processed · ${result.failedAttempts} failed attempts · ${result.excluded} excluded · ${result.deadLettered} dead-lettered · checkpoint complete · trend analytics refreshed.`,
        );
      }
    } catch (error) {
      const completedLabel =
        latestProgress.batches === 1 ? "1 completed batch" : `${latestProgress.batches} completed batches`;
      saveFeedback(
        "error",
        `Full backfill paused after ${completedLabel} · ${latestProgress.processed} processed · ${error instanceof Error ? error.message : "Action failed."} Progress is saved; run Full Backfill again to resume.`,
      );
    } finally {
      actionRunningRef.current = false;
      fullBackfillStopRef.current = false;
      setFullBackfillStopRequested(false);
      setFullBackfillProgress(null);
      setAction(null);
      router.refresh();
    }
  }

  async function runArchiveReprocess() {
    if (actionRunningRef.current) return;
    actionRunningRef.current = true;
    setReprocessConfirmationPending(false);
    setAction("reprocess");
    setFeedback(null);
    setReprocessProgress({ complete: 0, total: data.coverage.documentCount, failed: 0 });
    let offset = 0;
    let failed = 0;
    try {
      while (true) {
        const response = await postAction("/api/intelligence/reprocess", { offset, limit: 25 });
        const result = response.result ?? {};
        offset = Number(result.nextOffset ?? offset);
        failed += Number(result.failed ?? 0);
        const total = Number(result.total ?? data.coverage.documentCount);
        setReprocessProgress({ complete: offset, total, failed });
        if (!result.hasMore) break;
      }
      await postAction("/api/intelligence/trends");
      saveFeedback(
        failed ? "error" : "success",
        `Archive analytics rebuilt · ${offset} documents visited · ${failed} failed · source identities, article segments, concepts, relationships, and trend snapshots refreshed.`,
      );
    } catch (error) {
      saveFeedback(
        "error",
        `Archive reprocessing paused at ${offset} documents · ${error instanceof Error ? error.message : "Action failed."}`,
      );
    } finally {
      actionRunningRef.current = false;
      setAction(null);
      setReprocessProgress(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-8 pb-14">
      <section className="border-b border-foreground/80 pb-7">
        <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div className="max-w-4xl">
            <div className="accent-rule" />
            <p className="editorial-kicker mt-5">Trend intelligence / private</p>
            <h1 className="mt-2 max-w-3xl font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              Evidence before narrative.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              Track procurements, awards, funding, systems, trials, challenges, capability development,
              and strategic industry movement across the complete source archive.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/intelligence/explorer" />}>
              <Search className="size-4" /> Explore evidence
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/intelligence/trends" />}>
              <Activity className="size-4" /> Explore trends
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/intelligence/defence" />}>
              <Shield className="size-4" /> Defence view
            </Button>
            <Button nativeButton={false} render={<Link href="/dashboard/intelligence/operations" />}>
              <Database className="size-4" /> Operations
            </Button>
          </div>
        </div>
      </section>

      <SetupState data={data} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Source documents"
          value={compactNumber(data.coverage.documentCount)}
          detail="Normalized, deduplicated private source records"
          icon={Database}
        />
        <MetricCard
          label="Evidence events"
          value={compactNumber(data.coverage.eventCount)}
          detail="Announcements separated from ordinary mentions"
          icon={Sparkles}
        />
        <MetricCard
          label="Active sources"
          value={String(data.coverage.sourceCount)}
          detail="Independent configured source adapters"
          icon={Mail}
        />
        <MetricCard
          label="Top trend"
          value={topTrend ? `${Math.round(topTrend.strength)}` : "—"}
          detail={topTrend ? `${topTrend.label} / 100` : "No trend snapshot yet"}
          icon={Activity}
        />
        <MetricCard
          label="Source freshness"
          value={freshness === null ? "—" : `${freshness}h`}
          detail={readableDate(data.coverage.lastSyncedAt)}
          icon={RefreshCw}
        />
        <MetricCard
          label="Analytics freshness"
          value={analyticsFreshness === null ? "—" : `${analyticsFreshness}h`}
          detail={readableDate(data.coverage.analyticsComputedAt)}
          icon={Activity}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Evidence-backed movement</CardTitle>
            <CardDescription>
              Event and mention rates per 100 ingested documents; normalized to prevent high-volume
              senders from dominating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLineChart data={data.trendSeries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top trend movers</CardTitle>
            <CardDescription>Momentum, diversity, persistence, and evidence confidence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.trends.length ? (
              data.trends.slice(0, 7).map((trend) => (
                <Link href={`/dashboard/intelligence/trends/${encodeURIComponent(trend.key)}`} key={trend.key} className="block border-t border-border pt-3 first:border-t-0 first:pt-0 hover:text-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{trend.label}</span>
                        {trend.novelty ? <Badge variant="outline">New</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {trend.eventCount} events · {trend.sourceCount} sources
                      </p>
                    </div>
                    <span className="font-mono text-lg font-semibold">{Math.round(trend.strength)}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted">
                    <div className="h-full bg-accent" style={{ width: `${trend.strength}%` }} />
                  </div>
                </Link>
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Trend movers appear after the first completed enrichment batch.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source mix</CardTitle>
            <CardDescription>Coverage volume by source family, shown as context rather than trend strength.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars rows={data.sourceMix} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Event mix</CardTitle>
            <CardDescription>Distinct extracted events by intelligence taxonomy.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars rows={data.eventMix} />
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4 border-b border-foreground/80 pb-3">
          <div>
            <p className="editorial-kicker">Evidence ledger</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">Latest material events</h2>
          </div>
          <Link href="/dashboard/intelligence/explorer" className="inline-flex items-center gap-2 text-sm font-semibold hover:text-accent">
            Search all evidence <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="border-x border-b border-border">
          {data.events.length ? (
            data.events.slice(0, 10).map((event) => (
              <Link
                key={event.id}
                href={`/dashboard/intelligence/events/${event.id}`}
                className="grid gap-3 border-t border-border bg-card px-4 py-4 transition-colors hover:bg-muted/50 md:grid-cols-[9rem_1fr_auto]"
              >
                <div>
                  <Badge variant="outline">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {event.announcedAt ? event.announcedAt.slice(0, 10) : "Date unknown"}
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold">{event.title}</h3>
                    {event.defenceRelevance ? <Badge>Defence</Badge> : null}
                    {event.canadaAlliedRelevance ? <Badge variant="secondary">Canada / allied</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{event.summary}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground md:justify-end">
                  <span>{Math.round(event.confidence * 100)}% confidence</span>
                  <span>{event.evidenceCount} sources</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="border-t border-border px-6 py-16 text-center text-sm text-muted-foreground">
              No evidence-backed events have been extracted yet.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="size-4" /> Active alerts</CardTitle>
            <CardDescription>High-strength trends and saved-watchlist matches.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.alerts.length ? data.alerts.map((alert) => (
              <div key={alert.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-2">
                  <Badge variant={alert.severity === "urgent" ? "destructive" : "outline"}>{alert.severity}</Badge>
                  <span className="font-medium">{alert.title}</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{alert.summary}</p>
              </div>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">No active alerts.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Run the pipeline</CardTitle>
            <CardDescription>
              Bounded batches keep Gmail and model rate limits recoverable. Full Backfill repeats safe,
              resumable batches until the six-month checkpoint is complete. Keep this tab open.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                disabled={!configurationReady || Boolean(action)}
                onClick={() => runAction("sync", "/api/intelligence/sync", { mode: "incremental", maxMessages: 10 })}
              >
                <RefreshCw className={cn("size-4", action === "sync" && "animate-spin")} /> Daily sync
              </Button>
              <Button
                variant="outline"
                disabled={!configurationReady || Boolean(action)}
                onClick={() => runAction("backfill", "/api/intelligence/sync", { mode: "backfill", maxMessages: 10 })}
              >
                <Database className="size-4" /> Continue backfill
              </Button>
              <Button
                variant="outline"
                disabled={
                  !configurationReady ||
                  (Boolean(action) && action !== "full-backfill") ||
                  fullBackfillStopRequested
                }
                onClick={
                  action === "full-backfill" ? requestFullBackfillStop : runFullBackfill
                }
              >
                {action === "full-backfill" ? (
                  <Square className="size-4" />
                ) : (
                  <Database className="size-4" />
                )}
                {action === "full-backfill"
                  ? fullBackfillStopRequested
                    ? "Stopping after current batch"
                    : "Stop after current batch"
                  : "Full Backfill"}
              </Button>
              <Button
                variant="outline"
                disabled={!data.configuration.gmailConnected || Boolean(action)}
                onClick={() => runAction("discovery", "/api/intelligence/sync", { mode: "discovery", maxMessages: 25 })}
              >
                <Search className="size-4" /> Discover senders
              </Button>
              <Button
                variant="outline"
                disabled={data.status !== "ready" || Boolean(action)}
                onClick={() => runAction("trends", "/api/intelligence/trends")}
              >
                <Activity className={cn("size-4", action === "trends" && "animate-pulse")} /> Refresh trends
              </Button>
              <Button
                variant="outline"
                disabled={!configurationReady || Boolean(action)}
                onClick={() => {
                  if (reprocessConfirmationPending) void runArchiveReprocess();
                  else setReprocessConfirmationPending(true);
                }}
              >
                <Sparkles className={cn("size-4", action === "reprocess" && "animate-pulse")} /> Rebuild archive analytics
              </Button>
              <Button
                disabled={!configurationReady || Boolean(action)}
                onClick={() => runAction("digest", "/api/intelligence/digest")}
              >
                <Mail className="size-4" /> Send digest
              </Button>
            </div>
            {action === "full-backfill" && fullBackfillProgress ? (
              <p className="mt-3 border-t border-border pt-3 text-sm" aria-live="polite">
                {fullBackfillProgress.batches === 0 ? (
                  <>Full backfill · starting first batch · keep this tab open</>
                ) : (
                  <>
                    Full backfill · {batchCountLabel(fullBackfillProgress.batches)} completed ·{" "}
                    {fullBackfillProgress.processed} processed ·{" "}
                    {fullBackfillProgress.failedAttempts} failed attempts ·{" "}
                    {fullBackfillProgress.excluded} excluded ·{" "}
                    {fullBackfillProgress.pending} pending ·{" "}
                    {fullBackfillProgress.deadLettered} dead-lettered · keep this tab open
                  </>
                )}
              </p>
            ) : null}
            {action === "reprocess" && reprocessProgress ? (
              <p className="mt-3 border-t border-border pt-3 text-sm" aria-live="polite">
                Rebuilding archive analytics · {reprocessProgress.complete} / {reprocessProgress.total} documents visited · {reprocessProgress.failed} failed · keep this tab open
              </p>
            ) : null}
            {reprocessConfirmationPending && !action ? (
              <p className="mt-3 border-t border-border pt-3 text-sm" aria-live="polite">
                Rebuild confirmation ready. Existing enrichment is preserved; keep this tab open.
                Select <strong>Rebuild archive analytics</strong> again to start or select another
                action to cancel.
              </p>
            ) : null}
            {feedback ? (
              <p
                aria-live="polite"
                className={cn(
                  "mt-3 border-t border-border pt-3 text-sm",
                  feedback.kind === "error" ? "text-destructive" : "text-foreground",
                )}
              >
                {feedback.message}
              </p>
            ) : null}
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="editorial-kicker">Recent runs</p>
                <Link
                  href="/dashboard/intelligence/operations"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Full run ledger
                </Link>
              </div>
              <div className="mt-3 space-y-3">
                {data.recentRuns.length ? data.recentRuns.slice(0, 5).map((run) => (
                  <div key={run.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="capitalize text-sm font-medium">
                        {run.runType.replaceAll("_", " ")}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={runStatusVariant(run.status, run.isStale)}>{run.status}</Badge>
                        {run.isStale ? <Badge variant="destructive">stale</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground sm:grid-cols-4">
                      <span>{run.discoveredCount} discovered</span>
                      <span>{run.processedCount} processed</span>
                      <span>{run.failedCount} failed</span>
                      <span>{run.excludedCount} excluded</span>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
                      <p>Created {runTimestamp(run.createdAt, "unknown")}</p>
                      <p>
                        Started {runTimestamp(run.startedAt, "not started")} · Last activity{" "}
                        {runTimestamp(run.heartbeatAt, "no heartbeat")} · Completed{" "}
                        {runTimestamp(run.completedAt, "not completed")}
                      </p>
                      <p>Elapsed {elapsedLabel(run.elapsedSeconds)}</p>
                    </div>
                    {run.errorSummary ? (
                      <p className="mt-2 break-words text-xs leading-5 text-destructive">
                        {run.errorSummary}
                      </p>
                    ) : null}
                  </div>
                )) : <p className="text-xs text-muted-foreground">No run history yet.</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
