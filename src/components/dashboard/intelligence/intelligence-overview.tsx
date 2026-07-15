import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  FlaskConical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { publicSignalHref } from "@/lib/intelligence/public";
import { OverviewTrendChart } from "./overview-trend-chart";
import {
  DIRECTION_LABELS,
  KIND_LABELS,
  signalChange,
  type TrendSignal,
} from "./trend-ui-model";

export type CompletedResearchItem = {
  id: string;
  signalLabel: string;
  completedAt: string;
  summary: string;
  assessmentChange?: "strengthened" | "weakened" | "unchanged";
  href?: string;
};

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  if (!value) return "Date unknown";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function DirectionIcon({ direction }: { direction: TrendSignal["direction"] }) {
  if (direction === "cooling") return <ArrowDownRight className="size-4" aria-hidden />;
  if (direction === "sustained") return <CircleDot className="size-4" aria-hidden />;
  return <ArrowUpRight className="size-4" aria-hidden />;
}

function SignalSummary({ signal, publicView }: { signal: TrendSignal; publicView: boolean }) {
  const change = signalChange(signal);
  const href = publicView
    ? publicSignalHref(signal)
    : `/dashboard/intelligence/explore?signal=${encodeURIComponent(signal.id)}`;
  return (
    <Link href={href} className="group block border-t border-foreground px-2 py-5 outline-none motion-safe:transition-colors first:border-t-0 first:pt-0 hover:bg-card/80 focus-visible:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_210px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={signal.evidenceStrength === "Early" ? "outline" : "secondary"}>{signal.evidenceStrength} evidence</Badge>
            <span className="text-xs text-muted-foreground">{KIND_LABELS[signal.kind]}</span>
          </div>
          <h3 className="mt-2 font-heading text-2xl font-semibold motion-safe:transition-colors group-hover:text-accent group-focus-visible:text-accent">{titleCase(signal.label)}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.whyNow}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="border-l-2 border-accent pl-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">Why it matters</p>
              <p className="mt-1 text-sm leading-6">{signal.whyItMatters}</p>
            </div>
            <div className="border-l-2 border-border pl-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">What to watch</p>
              <p className="mt-1 text-sm leading-6">{signal.whatToWatch}</p>
            </div>
          </div>
        </div>
        <div className="border-l border-border pl-4 md:text-right">
          <p className="text-sm font-semibold">Now {signal.currentReach.toFixed(1)}% of coverage</p>
          <p className="mt-1 text-xs text-muted-foreground">Previously {signal.previousReach.toFixed(1)}% · {change >= 0 ? "+" : ""}{change.toFixed(1)} points</p>
          <p className="mt-4 text-xs text-muted-foreground">{signal.stories} unique stories · {signal.sources} independent sources</p>
          <p className="mt-1 text-xs text-muted-foreground">{signal.actions ? `${signal.actions} related actions` : "No concrete action confirmed yet"}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold underline decoration-accent/40 decoration-2 underline-offset-4 group-hover:decoration-accent">
            View trend <ArrowRight className="size-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function MovementSection({
  title,
  description,
  signals,
  publicView,
}: {
  title: string;
  description: string;
  signals: TrendSignal[];
  publicView: boolean;
}) {
  return (
    <section>
      <div className="mb-4 border-b border-foreground pb-3">
        <h2 className="font-heading text-3xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {signals.length ? signals.slice(0, 5).map((signal) => <SignalSummary key={signal.id} signal={signal} publicView={publicView} />) : (
        <p className="border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">Nothing meets the evidence threshold for this section today.</p>
      )}
    </section>
  );
}

export function IntelligenceOverview({
  signals,
  completeThrough,
  completedResearch = [],
  dataStatus = "ready",
  usesLegacyFallback = false,
  publicView = false,
}: {
  signals: TrendSignal[];
  completeThrough: string;
  completedResearch?: CompletedResearchItem[];
  dataStatus?: "ready" | "stale" | "disabled" | "building" | "schema_missing";
  usesLegacyFallback?: boolean;
  publicView?: boolean;
}) {
  const sorted = [...signals].sort((a, b) => {
    const evidence = { Strong: 3, Moderate: 2, Early: 1 };
    return evidence[b.evidenceStrength] - evidence[a.evidenceStrength]
      || b.actions - a.actions
      || signalChange(b) - signalChange(a);
  });
  const attention = sorted.filter((signal) => signal.direction === "new" || signal.direction === "rising").slice(0, 3);
  const topThree = attention.length === 3 ? attention : [...attention, ...sorted.filter((signal) => !attention.includes(signal))].slice(0, 3);
  const byDirection = (direction: TrendSignal["direction"]) =>
    signals.filter((signal) => signal.direction === direction).sort((a, b) => signalChange(b) - signalChange(a));

  return (
    <div className="space-y-12 pb-16">
      <header className="border-b border-foreground pb-7">
        <p className="editorial-kicker">Intelligence / overview</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
          <div>
            <h1 className="max-w-4xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">What deserves attention?</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">A quick read of what is new, building, holding, or cooling across {publicView ? "the monitored source coverage" : "your coverage"}—and why it matters.</p>
          </div>
          <div className="border-l-2 border-accent pl-4 text-sm">
            <p className="font-semibold">Share of all eligible coverage</p>
            <p className="mt-1 text-muted-foreground">Complete through {formatDate(completeThrough)}</p>
          </div>
        </div>
      </header>

      {dataStatus === "stale" && !usesLegacyFallback ? (
        <section className="border border-amber-500/50 bg-amber-500/10 p-4 text-sm leading-6" role="status">
          <p className="font-semibold">The latest analysis refresh is still catching up.</p>
          <p className="mt-1 text-muted-foreground">Showing the last fully completed series through {formatDate(completeThrough)}. Incomplete newer results remain hidden.</p>
        </section>
      ) : null}

      {usesLegacyFallback ? (
        <section className="border border-border bg-muted/20 p-4 text-sm leading-6">
          <p className="font-semibold">Detailed signal history is being prepared.</p>
          <p className="mt-1 text-muted-foreground">The existing archive view remains visible while the new daily measurement series {dataStatus === "schema_missing" ? "is installed" : dataStatus === "disabled" ? "waits for the production switch" : "finishes its complete archive backfill"}. Partial v2 results stay hidden.</p>
        </section>
      ) : null}

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-foreground pb-3">
          <div>
            <p className="editorial-kicker">Today’s analyst view</p>
            <h2 className="mt-1 font-heading text-3xl font-semibold">Three things worth attention</h2>
          </div>
          <Link href={publicView ? "/intelligence/explore" : "/dashboard/intelligence/explore"} className="link-accent inline-flex min-h-10 items-center gap-1 text-sm">Explore everything <ArrowRight className="size-4" /></Link>
        </div>
        {topThree.length ? (
          <div className="grid border-l border-t border-border lg:grid-cols-3">
            {topThree.map((signal, index) => {
              const change = signalChange(signal);
              return (
                <Link
                  key={signal.id}
                  href={publicView ? publicSignalHref(signal) : `/dashboard/intelligence/explore?signal=${encodeURIComponent(signal.id)}`}
                  className="group flex min-h-[360px] flex-col border-b border-r border-border bg-card p-5 outline-none motion-safe:transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                    <Badge variant={signal.evidenceStrength === "Early" ? "outline" : "default"}>{signal.evidenceStrength}</Badge>
                  </div>
                  <p className="mt-7 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em]"><DirectionIcon direction={signal.direction} /> {DIRECTION_LABELS[signal.direction]}</p>
                  <h3 className="mt-2 font-heading text-2xl font-semibold motion-safe:transition-colors group-hover:text-accent group-focus-visible:text-accent">{titleCase(signal.label)}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{KIND_LABELS[signal.kind]}</p>
                  <p className="mt-5 text-sm leading-6 text-muted-foreground">{signal.whyNow}</p>
                  <div className="mt-auto pt-6">
                    <p className="font-mono text-2xl font-semibold">{signal.currentReach.toFixed(1)}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">of coverage, previously {signal.previousReach.toFixed(1)}% ({change >= 0 ? "+" : ""}{change.toFixed(1)} points)</p>
                    <p className="mt-3 text-xs text-muted-foreground">{signal.stories} stories · {signal.sources} sources · {signal.actions} actions</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold underline decoration-accent/40 decoration-2 underline-offset-4 group-hover:decoration-accent">
                      View trend <ArrowRight className="size-3" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="border border-dashed border-border px-5 py-16 text-center text-sm text-muted-foreground">The archive has not produced a supported signal yet.</p>
        )}
      </section>

      <section>
        <div className="mb-5 border-b border-foreground pb-3">
          <p className="editorial-kicker">Movement over time</p>
          <h2 className="mt-1 font-heading text-3xl font-semibold">How attention is changing</h2>
          <p className="mt-2 text-sm text-muted-foreground">Each line shows the signal’s share of eligible coverage. Select a point to see evidence from that period.</p>
        </div>
        <OverviewTrendChart signals={topThree} />
      </section>

      <MovementSection title="New this week" description="Signals with little or no earlier coverage that now appear across more than one source." signals={byDirection("new")} publicView={publicView} />
      <MovementSection title="Building momentum" description="Signals taking a meaningfully larger share of coverage than in the previous period." signals={byDirection("rising")} publicView={publicView} />
      <MovementSection title="Sustained attention" description="Signals that remain consistently prominent without a clear rise or decline." signals={byDirection("sustained")} publicView={publicView} />
      <MovementSection title="Cooling" description="Signals receiving a smaller share of coverage than in the previous period." signals={byDirection("cooling").reverse()} publicView={publicView} />

      <section>
        <div className="mb-4 flex items-center gap-2 border-b border-foreground pb-3">
          <FlaskConical className="size-5" />
          <div>
            <p className="editorial-kicker">Research completed</p>
            <h2 className="mt-1 font-heading text-3xl font-semibold">Since the last brief</h2>
          </div>
        </div>
        {completedResearch.length ? (
          <div className="divide-y divide-border border-y border-border">
            {completedResearch.map((item) => (
              <article key={item.id} className="grid gap-3 py-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-start">
                <div><p className="font-semibold">{item.signalLabel}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.completedAt)}</p></div>
                <p className="text-sm leading-6 text-muted-foreground">{item.summary}</p>
                {item.href ? <Link href={item.href} className="link-accent inline-flex items-center gap-1 text-xs">Read research <ArrowRight className="size-3" /></Link> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">No research has completed since the last brief. Strong new or rising signals will appear here after their evidence is checked.</p>
        )}
      </section>
    </div>
  );
}
