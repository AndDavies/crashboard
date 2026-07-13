import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CheckCircle2, Clock3, Database, Mail, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperationsControls } from "@/components/dashboard/intelligence/operations-controls";
import {
  PromoteSourceButton,
  SourceAutomationActions,
} from "@/components/dashboard/intelligence/source-automation-actions";
import { getIntelligenceOperations } from "@/lib/intelligence/data";
import type { IntelligenceRunDiagnostic } from "@/lib/intelligence/types";

export const metadata: Metadata = {
  title: "Sources & Automations · Crashboard Intelligence",
  description: "Manage intelligence sources, scheduled collection, research, and delivery.",
};
export const dynamic = "force-dynamic";

function timestamp(value: string | null, emptyLabel = "Not yet") {
  if (!value) return emptyLabel;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Halifax",
  }).format(new Date(value));
}

function runName(value: string) {
  const names: Record<string, string> = {
    sync: "Gmail sync",
    backfill: "Archive backfill",
    discovery: "Source discovery",
    crawl: "External source collection",
    trends: "Trend analysis",
    trend_refresh: "Trend analysis",
    signal_refresh: "Trend analysis",
    topic_maintenance: "Topic upkeep",
    research: "Signal research",
    digest: "Morning brief",
  };
  return names[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusVariant(run: IntelligenceRunDiagnostic) {
  if (run.isStale || run.status === "failed" || run.status === "cancelled") return "destructive" as const;
  if (run.status === "completed") return "default" as const;
  if (run.status === "partial") return "secondary" as const;
  return "outline" as const;
}

function sourceType(value: string) {
  const labels: Record<string, string> = {
    email_newsletter: "Gmail newsletters",
    gmail: "Gmail newsletters",
    web_article: "Web articles",
    official_release: "Official releases",
    procurement_notice: "Buying opportunities",
    podcast_episode: "Podcasts",
    youtube_video: "YouTube",
    reddit_post: "Reddit",
    social_post: "Social posts",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export default async function SourcesAutomationsPage() {
  const data = await getIntelligenceOperations();
  const gmailConnected = data.sources.some((source) => source.source_type === "gmail" || source.source_type === "email_newsletter");
  const latestRun = data.runs[0] ?? null;
  const failedRuns = data.runs.filter((run) => run.status === "failed" || run.isStale).length;
  const latestDigest = data.digests[0] ?? null;

  return (
    <div className="space-y-10 pb-16">
      <header className="border-b border-foreground pb-6">
        <p className="editorial-kicker">Intelligence / sources &amp; automations</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold sm:text-5xl">Keep the evidence flowing.</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">Manage where intelligence comes from, see whether scheduled work completed, and run a safe catch-up when needed.</p>
      </header>

      {!gmailConnected ? (
        <section className="flex flex-col justify-between gap-5 border border-foreground bg-card p-5 sm:flex-row sm:items-center">
          <div><p className="editorial-kicker">First source</p><h2 className="mt-1 font-heading text-xl font-semibold">Connect Gmail newsletters</h2><p className="mt-1 text-sm text-muted-foreground">The connection is read-only for collection. Sending access is used only for your morning brief.</p></div>
          <Button nativeButton={false} render={<a href="/api/intelligence/google/start" />}><Mail className="size-4" /> Connect Gmail</Button>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-border bg-card p-4"><Database className="size-4 text-muted-foreground" /><p className="mt-5 font-mono text-3xl font-semibold">{data.sources.length}</p><p className="mt-1 text-sm font-medium">configured sources</p></div>
        <div className="border border-border bg-card p-4"><Activity className="size-4 text-muted-foreground" /><p className="mt-5 text-sm font-semibold">{latestRun ? runName(latestRun.runType) : "No run yet"}</p><p className="mt-1 text-xs text-muted-foreground">Latest activity · {latestRun ? timestamp(latestRun.heartbeatAt ?? latestRun.createdAt) : "not yet"}</p></div>
        <div className="border border-border bg-card p-4">{failedRuns ? <TriangleAlert className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-muted-foreground" />}<p className="mt-5 font-mono text-3xl font-semibold">{failedRuns}</p><p className="mt-1 text-sm font-medium">failed or stalled recent runs</p></div>
        <div className="border border-border bg-card p-4"><Mail className="size-4 text-muted-foreground" /><p className="mt-5 text-sm font-semibold">{latestDigest ? latestDigest.status : "No brief yet"}</p><p className="mt-1 text-xs text-muted-foreground">Last morning brief · {latestDigest ? timestamp(String(latestDigest.sent_at ?? latestDigest.digest_date)) : "not yet"}</p></div>
      </section>

      <SourceAutomationActions gmailConnected={gmailConnected} />

      <section>
        <div className="border-b border-foreground pb-3"><p className="editorial-kicker">Automatic schedule</p><h2 className="mt-1 font-heading text-2xl font-semibold">What runs each morning</h2><p className="mt-1 text-sm text-muted-foreground">Times are Halifax local time. Paired server triggers keep the schedule reliable through daylight-saving changes.</p></div>
        <ol className="grid border-l border-t border-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["04:00", "Collect external sources", "Approved feeds, official releases, procurement sources, and permitted pages."],
            ["05:00", "Sync Gmail", "New newsletters and any resumable enrichment work."],
            ["06:00", "Refresh signals", "Group duplicate stories, update trend lines, and start bounded research."],
            ["07:00", "Send morning brief", "Top signals, watch items, completed research, and linked evidence."],
          ].map(([time, title, description]) => (
            <li key={time} className="border-b border-r border-border bg-card p-4"><p className="font-mono text-2xl font-semibold">{time}</p><p className="mt-5 font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></li>
          ))}
        </ol>
      </section>

      <section>
        <div className="border-b border-foreground pb-3"><p className="editorial-kicker">Source registry</p><h2 className="mt-1 font-heading text-2xl font-semibold">Regular and research-only sources</h2><p className="mt-1 text-sm text-muted-foreground">Regular sources can affect trend scores. Research-only sources add context until you approve them for future measurement.</p></div>
        <div className="border-x border-b border-border">
          {data.sources.length ? data.sources.map((source) => {
            const config = (source.config ?? {}) as Record<string, unknown>;
            const cohort = source.cohort ?? String(config.cohort ?? "measurement");
            return (
              <article key={source.id} className="grid gap-4 border-t border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-lg font-semibold">{source.name}</h3><Badge variant={source.status === "active" ? "default" : "outline"}>{source.status === "active" ? "Active" : source.status === "candidate" ? "Awaiting approval" : source.status}</Badge><Badge variant="secondary">{cohort === "research" ? "Research only" : source.status === "active" ? "Regular source" : "Proposed regular source"}</Badge></div>
                  <p className="mt-1 text-sm text-muted-foreground">{sourceType(source.source_type)} · Last successful collection {timestamp(source.last_successful_fetch_at ?? source.last_synced_at, "not yet")}</p>
                  {source.last_error ? <p className="mt-2 text-sm text-destructive">{source.last_error}</p> : null}
                  {cohort === "measurement" && source.measurement_active_from ? <p className="mt-2 text-xs text-muted-foreground">Contributes to trend measurement prospectively from {timestamp(source.measurement_active_from)}.</p> : null}
                </div>
                {cohort === "research" || source.status === "candidate" || source.status === "inactive" ? <PromoteSourceButton sourceId={source.id} /> : null}
              </article>
            );
          }) : <p className="border-t border-border px-6 py-14 text-center text-sm text-muted-foreground">No sources are configured yet.</p>}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div>
          <div className="border-b border-foreground pb-3"><p className="editorial-kicker">Recent work</p><h2 className="mt-1 font-heading text-2xl font-semibold">Automation history</h2></div>
          <div className="border-x border-b border-border">
            {data.runs.length ? data.runs.slice(0, 20).map((run) => (
              <article key={run.id} className="border-t border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{runName(run.runType)}</p><p className="mt-1 text-xs text-muted-foreground">{timestamp(run.createdAt)}</p></div><Badge variant={statusVariant(run)}>{run.isStale ? "Needs attention" : run.status === "completed" ? "Completed" : run.status}</Badge></div>
                <p className="mt-3 text-xs text-muted-foreground">{run.processedCount} updated · {run.failedCount} failed · {run.excludedCount} excluded</p>
                {run.errorSummary ? <p className="mt-3 border-t border-border pt-3 text-sm text-destructive">{run.errorSummary}</p> : null}
              </article>
            )) : <p className="border-t border-border px-6 py-14 text-center text-sm text-muted-foreground">No automation history yet.</p>}
          </div>
        </div>
        <div className="space-y-6">
          <div className="border border-border bg-card p-5"><Clock3 className="size-4" /><p className="mt-5 font-semibold">Research guardrails</p><ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li>Up to 5 automated research leads a day</li><li>Up to 100 fetched pages a day</li><li>$5 estimated daily OpenAI budget</li><li>7-day cooldown for each signal</li></ul><p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Research evidence cannot change trend scores until its source is approved as a regular source.</p></div>
          <div><div className="border-b border-foreground pb-3"><p className="editorial-kicker">Brief delivery</p><h2 className="mt-1 font-heading text-2xl font-semibold">Recent morning briefs</h2></div><div className="border-x border-b border-border">{data.digests.length ? data.digests.slice(0, 8).map((digest) => <article key={digest.id} className="border-t border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{digest.subject}</p><Badge variant={digest.status === "failed" ? "destructive" : "outline"}>{digest.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{timestamp(String(digest.sent_at ?? digest.digest_date))}</p>{digest.error_message ? <p className="mt-2 text-sm text-destructive">{digest.error_message}</p> : null}</article>) : <p className="border-t border-border px-5 py-10 text-center text-sm text-muted-foreground">No briefs sent yet.</p>}</div></div>
        </div>
      </section>

      <section>
        <div className="border-b border-foreground pb-3"><p className="editorial-kicker">Tracked questions</p><h2 className="mt-1 font-heading text-2xl font-semibold">Watchlists</h2><p className="mt-1 text-sm text-muted-foreground">Save important terms and choose how much evidence is needed before they surface.</p></div>
        <div className="mt-4"><OperationsControls watchlists={data.watchlists as never[]} /></div>
      </section>

      <div className="border-t border-border pt-5 text-sm text-muted-foreground">Need to rebuild all extracted archive data? Use the dedicated <Link href="/dashboard/intelligence/reprocess" className="font-semibold text-foreground hover:text-accent">archive rebuild</Link>. Normal daily operation does not require it.</div>
    </div>
  );
}
