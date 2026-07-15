"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  FlaskConical,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicSignalHref } from "@/lib/intelligence/public";
import { cn } from "@/lib/utils";
import { InteractiveTrendChart } from "./trend-chart";
import {
  DIRECTION_LABELS,
  evidenceForChartPeriod,
  KIND_LABELS,
  signalChange,
  type TrendEvidence,
  type TrendSignal,
} from "./trend-ui-model";

export type ExploreSearchResult = TrendEvidence & {
  signalLabel?: string;
  sourceType?: string;
};

type Lens = "all" | "defence" | "ai" | "cyber" | "canada-allies";
type KindFilter = "all" | "topic" | "keyword" | "organization" | "system";
type Range = "30d" | "90d" | "180d" | "365d";

const LENSES: Array<{ id: Lens; label: string }> = [
  { id: "all", label: "All" },
  { id: "defence", label: "Defence & Security" },
  { id: "ai", label: "AI" },
  { id: "cyber", label: "Cyber" },
  { id: "canada-allies", label: "Canada & Allies" },
];

const KINDS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "topic", label: "Topics" },
  { id: "keyword", label: "Keywords" },
  { id: "organization", label: "Organizations" },
  { id: "system", label: "Systems" },
];

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "30d", label: "1 month" },
  { id: "90d", label: "3 months" },
  { id: "180d", label: "6 months" },
  { id: "365d", label: "1 year" },
];

const LENS_TERMS: Record<Exclude<Lens, "all">, string[]> = {
  defence: ["defence", "defense", "military", "army", "navy", "air force", "weapon", "missile", "drone", "uncrewed", "nato", "security", "c-uas", "procurement"],
  ai: ["artificial intelligence", " ai ", "machine learning", "model", "autonomous", "automation", "computer vision", "generative"],
  cyber: ["cyber", "ransomware", "malware", "zero trust", "network security", "vulnerability", "encryption", "information warfare"],
  "canada-allies": ["canada", "canadian", "nato", "norad", "five eyes", "united kingdom", "uk ", "australia", "allied", "allies", "dnd", "caf"],
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

function matchesLens(signal: TrendSignal, lens: Lens) {
  if (lens === "all") return true;
  const text = [signal.label, signal.whyNow, signal.whyItMatters, signal.whatToWatch]
    .join(" ")
    .toLocaleLowerCase("en-CA");
  return LENS_TERMS[lens].some((term) => text.includes(term));
}

function matchesQuery(signal: TrendSignal, query: string) {
  if (!query.trim()) return true;
  const text = [
    signal.label,
    signal.kind,
    signal.whyNow,
    signal.whyItMatters,
    signal.whatToWatch,
    ...signal.evidence.map((item) => `${item.title} ${item.passage ?? ""}`),
  ].join(" ").toLocaleLowerCase("en-CA");
  const tokens = query.toLocaleLowerCase("en-CA").split(/[^a-z0-9-]+/).filter((token) => token.length > 2);
  return text.includes(query.toLocaleLowerCase("en-CA")) || tokens.some((token) => text.includes(token));
}

function hrefWith(
  basePath: string,
  current: { lens: Lens; kind: KindFilter; range: Range; q: string; compare?: string[]; signal?: string },
  update: Partial<{ lens: Lens; kind: KindFilter; range: Range; q: string; compare: string[]; signal: string }>,
) {
  const next = { ...current, ...update };
  const params = new URLSearchParams();
  if (next.lens !== "all") params.set("lens", next.lens);
  if (next.kind !== "all") params.set("kind", next.kind);
  if (next.range !== "90d") params.set("range", next.range);
  if (next.q) params.set("q", next.q);
  if (next.compare?.length) params.set("compare", next.compare.slice(0, 5).join(","));
  if (next.signal) params.set("signal", next.signal);
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

function filteredSeries(signal: TrendSignal, range: Range) {
  if (!signal.series.length) return signal;
  const days = Number.parseInt(range, 10);
  const lastDate = new Date(`${signal.series.at(-1)!.date}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() - days + 1);
  const cutoff = lastDate.toISOString().slice(0, 10);
  return { ...signal, series: signal.series.filter((point) => point.date >= cutoff) };
}

function ResearchButton({ signal }: { signal: TrendSignal }) {
  const [state, setState] = useState<"idle" | "working" | "queued" | "running" | "completed" | "error">(
    signal.researchStatus === "not_started" || signal.researchStatus === "failed"
      ? "idle"
      : signal.researchStatus,
  );

  async function startResearch() {
    setState("working");
    try {
      const response = await fetch("/api/intelligence/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signalId: signal.id,
          signalKind: signal.kind,
          signalLabel: signal.label,
          reason: "Manual research from Explore",
        }),
      });
      if (!response.ok) throw new Error("Research request failed");
      setState("queued");
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <Button onClick={startResearch} disabled={["working", "queued", "running", "completed"].includes(state)}>
        {state === "completed" ? <Check className="size-4" /> : <FlaskConical className="size-4" />}
        {state === "working"
          ? "Starting research…"
          : state === "queued"
            ? "Research queued"
            : state === "running"
              ? "Researching…"
              : state === "completed"
                ? "Research complete"
                : "Research further"}
      </Button>
      {state === "queued" ? <p className="mt-2 max-w-56 text-xs text-muted-foreground">The local Codex worker will process this request.</p> : null}
      {state === "completed" && signal.researchCompletedAt ? <p className="mt-2 max-w-56 text-xs text-muted-foreground">Completed {formatDate(signal.researchCompletedAt)}. Research sources appear in the evidence list.</p> : null}
      {state === "error" ? <p className="mt-2 text-xs text-destructive">Research could not be queued. Try again after refreshing this page.</p> : null}
    </div>
  );
}

export function ExploreWorkspace({
  signals,
  listedSignalIds,
  searchResults,
  initialLens = "all",
  initialKind = "all",
  initialRange = "90d",
  initialQuery = "",
  initialSignalId,
  initialCompare = [],
  dataStatus = "ready",
  usesLegacyFallback = false,
  basePath = "/dashboard/intelligence/explore",
  researchEnabled = true,
}: {
  signals: TrendSignal[];
  listedSignalIds: string[];
  searchResults: ExploreSearchResult[];
  initialLens?: Lens;
  initialKind?: KindFilter;
  initialRange?: Range;
  initialQuery?: string;
  initialSignalId?: string;
  initialCompare?: string[];
  dataStatus?: "ready" | "stale" | "disabled" | "building" | "schema_missing";
  usesLegacyFallback?: boolean;
  basePath?: string;
  researchEnabled?: boolean;
}) {
  const query = initialQuery.trim();
  const visibleSignals = useMemo(() => signals
    .filter((signal) => usesLegacyFallback
      ? matchesLens(signal, initialLens)
      : listedSignalIds.includes(signal.id))
    .filter((signal) => !usesLegacyFallback || initialKind === "all" || signal.kind === initialKind || (initialKind === "system" && signal.kind === "programme"))
    .filter((signal) => !usesLegacyFallback || matchesQuery(signal, query))
    .sort((a, b) => {
      const direction = { new: 4, rising: 3, sustained: 2, cooling: 1 };
      return direction[b.direction] - direction[a.direction] || signalChange(b) - signalChange(a);
    }), [initialKind, initialLens, listedSignalIds, query, signals, usesLegacyFallback]);
  const firstSignal = signals.find((signal) => signal.id === initialSignalId)
    ?? visibleSignals[0]
    ?? signals[0]
    ?? null;
  const [selectedId, setSelectedId] = useState(firstSignal?.id ?? "");
  const [compareIds, setCompareIds] = useState<string[]>(() => {
    const valid = initialCompare.filter((id) => signals.some((signal) => signal.id === id)).slice(0, 5);
    if (valid.length) return valid;
    return firstSignal ? [firstSignal.id] : [];
  });
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const selected = signals.find((signal) => signal.id === selectedId) ?? firstSignal;
  const comparedSignals = compareIds
    .map((id) => signals.find((signal) => signal.id === id))
    .filter((signal): signal is TrendSignal => Boolean(signal))
    .map((signal) => filteredSeries(signal, initialRange));
  const cadence = initialRange === "30d" ? "daily" : "weekly";
  const selectedEvidence = selected
    ? evidenceForChartPeriod(selected.evidence, selectedPeriod, cadence)
    : [];
  const current = {
    lens: initialLens,
    kind: initialKind,
    range: initialRange,
    q: query,
    compare: compareIds,
    signal: selected?.id,
  };

  function toggleComparison(id: string) {
    setCompareIds((ids) => {
      if (ids.includes(id)) return ids.filter((candidate) => candidate !== id);
      if (ids.length >= 5) return ids;
      return [...ids, id];
    });
  }

  return (
    <div className="space-y-8 pb-16">
      <header className="border-b border-foreground pb-6">
        <p className="editorial-kicker">Intelligence / explore</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold sm:text-5xl">Find what is moving—and why.</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">Compare topics, exact keywords, organizations, programmes, and systems. Every explanation stays connected to its source evidence.</p>
      </header>

      {dataStatus === "stale" && !usesLegacyFallback ? (
        <div className="border border-amber-500/50 bg-amber-500/10 p-4 text-sm leading-6" role="status">
          <p className="font-semibold">The latest analysis refresh is still catching up.</p>
          <p className="mt-1 text-muted-foreground">Search and charts are using the last fully completed series. Incomplete newer results remain hidden.</p>
        </div>
      ) : null}

      {usesLegacyFallback ? (
        <div className="border border-border bg-muted/20 p-4 text-sm leading-6">
          <p className="font-semibold">Detailed signal history is being prepared.</p>
          <p className="mt-1 text-muted-foreground">Search and comparison are using the existing archive view while the new daily series {dataStatus === "schema_missing" ? "is installed" : dataStatus === "disabled" ? "waits for the production switch" : "finishes its complete archive backfill"}. Partial v2 results stay hidden.</p>
        </div>
      ) : null}

      <form action={basePath} className="grid gap-2 border border-foreground bg-card p-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="sr-only" htmlFor="intelligence-search">Search signals and evidence</label>
        <Input id="intelligence-search" name="q" defaultValue={query} placeholder="Name, acronym, system, programme, solicitation ID, or a question" className="h-11 border-0 bg-transparent shadow-none" />
        {initialLens !== "all" ? <input type="hidden" name="lens" value={initialLens} /> : null}
        {initialKind !== "all" ? <input type="hidden" name="kind" value={initialKind} /> : null}
        {initialRange !== "90d" ? <input type="hidden" name="range" value={initialRange} /> : null}
        {compareIds.length ? <input type="hidden" name="compare" value={compareIds.join(",")} /> : null}
        {selected ? <input type="hidden" name="signal" value={selected.id} /> : null}
        <Button type="submit" className="h-11"><Search className="size-4" /> Search</Button>
      </form>

      <section className="space-y-4" aria-label="Explore filters">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lens</span>
          {LENSES.map((lens) => (
            <Link key={lens.id} href={hrefWith(basePath, current, { lens: lens.id })} className={cn("border px-3 py-1.5 text-sm transition-colors", lens.id === initialLens ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground")} aria-current={lens.id === initialLens ? "page" : undefined}>{lens.label}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Show</span>
          {KINDS.map((kind) => (
            <Link key={kind.id} href={hrefWith(basePath, current, { kind: kind.id })} className={cn("border-b-2 px-2 py-1 text-sm", kind.id === initialKind ? "border-accent font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")} aria-current={kind.id === initialKind ? "page" : undefined}>{kind.label}</Link>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{visibleSignals.length} signals</span>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-foreground pb-3">
          <div>
            <p className="editorial-kicker">Compare</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">Share of coverage over time</h2>
          </div>
          <div className="flex flex-wrap gap-1" aria-label="Time range">
            {RANGES.map((range) => (
              <Link key={range.id} href={hrefWith(basePath, current, { range: range.id })} className={cn("border px-3 py-1.5 text-xs", range.id === initialRange ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground")} aria-current={range.id === initialRange ? "page" : undefined}>{range.label}</Link>
            ))}
          </div>
        </div>
        <div className="mt-4 flex min-h-9 flex-wrap gap-2">
          {comparedSignals.map((signal) => (
            <button key={signal.id} type="button" onClick={() => toggleComparison(signal.id)} className="inline-flex items-center gap-2 border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-foreground"><span>{titleCase(signal.label)}</span><X className="size-3" aria-hidden /></button>
          ))}
          {compareIds.length < 5 ? <span className="self-center text-xs text-muted-foreground">Add up to {5 - compareIds.length} more from the signal list below.</span> : <span className="self-center text-xs text-muted-foreground">Comparison is full.</span>}
        </div>
        <div className="mt-4">
          <InteractiveTrendChart signals={comparedSignals} selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriod} />
        </div>
      </section>

      <section className="grid gap-7 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
        <div>
          <div className="border-b border-foreground pb-3">
            <p className="editorial-kicker">Signals</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">What is moving</h2>
          </div>
          <div className="max-h-[920px] overflow-y-auto border-x border-b border-border">
            {visibleSignals.length ? visibleSignals.map((signal) => {
              const compared = compareIds.includes(signal.id);
              const change = signalChange(signal);
              return (
                <article key={signal.id} className={cn("border-t border-border bg-card p-4", selected?.id === signal.id && "bg-muted/50")}>
                  <button type="button" className="w-full text-left" onClick={() => setSelectedId(signal.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="text-xs text-muted-foreground">{KIND_LABELS[signal.kind]} · {DIRECTION_LABELS[signal.direction]}</p><h3 className="mt-1 font-heading text-lg font-semibold">{titleCase(signal.label)}</h3></div>
                      <Badge variant={signal.evidenceStrength === "Early" ? "outline" : "secondary"}>{signal.evidenceStrength}</Badge>
                    </div>
                    <p className="mt-3 text-sm"><strong>{signal.currentReach.toFixed(1)}%</strong> of coverage, previously {signal.previousReach.toFixed(1)}% <span className={change < 0 ? "text-muted-foreground" : ""}>({change >= 0 ? "+" : ""}{change.toFixed(1)} points)</span></p>
                    <p className="mt-2 text-xs text-muted-foreground">{signal.stories} stories · {signal.sources} sources · {signal.actions} actions</p>
                  </button>
                  <button type="button" onClick={() => toggleComparison(signal.id)} disabled={!compared && compareIds.length >= 5} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:text-accent disabled:cursor-not-allowed disabled:opacity-40">
                    {compared ? <><Check className="size-3" /> In comparison</> : <><Plus className="size-3" /> Add to comparison</>}
                  </button>
                </article>
              );
            }) : (
              <p className="border-t border-border px-6 py-16 text-center text-sm text-muted-foreground">No signals match these filters. Widen the lens or search a broader term.</p>
            )}
          </div>
        </div>

        <div>
          {selected ? (
            <article className="sticky top-5 border border-foreground bg-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge>{DIRECTION_LABELS[selected.direction]}</Badge><span className="text-xs text-muted-foreground">{KIND_LABELS[selected.kind]} · {selected.evidenceStrength} evidence</span></div>
                  <h2 className="mt-3 font-heading text-3xl font-semibold">{titleCase(selected.label)}</h2>
                </div>
                {researchEnabled ? (
                  <ResearchButton key={selected.id} signal={selected} />
                ) : (
                  <Button render={<Link href={publicSignalHref(selected)} />} variant="outline">
                    Open trend page
                  </Button>
                )}
              </div>

              <div className="mt-6 grid gap-3 border-y border-border py-4 sm:grid-cols-4">
                <div><p className="font-mono text-xl font-semibold">{selected.currentReach.toFixed(1)}%</p><p className="text-xs text-muted-foreground">share of coverage</p></div>
                <div><p className="font-mono text-xl font-semibold">{selected.stories}</p><p className="text-xs text-muted-foreground">unique stories</p></div>
                <div><p className="font-mono text-xl font-semibold">{selected.sources}</p><p className="text-xs text-muted-foreground">independent sources</p></div>
                <div><p className="font-mono text-xl font-semibold">{selected.actions}</p><p className="text-xs text-muted-foreground">real-world actions</p></div>
              </div>

              <div className="mt-6 grid gap-5">
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em]">Why now</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{selected.whyNow}</p></div>
                <div className="border-l-2 border-accent pl-4"><p className="text-xs font-semibold uppercase tracking-[0.12em]">Why it matters</p><p className="mt-1 text-sm leading-6">{selected.whyItMatters}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em]">What to watch</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{selected.whatToWatch}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em]">What is happening</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{selected.actions ? `${selected.actions} distinct buying, funding, testing, award, deployment, or policy actions are linked to this signal.` : "No distinct buying, funding, testing, award, deployment, or policy action has been confirmed yet."}</p></div>
              </div>

              {selected.related.length ? (
                <div className="mt-7 border-t border-border pt-5">
                  <p className="editorial-kicker">Related signals and terms</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.related.map((related) => (
                      <Link
                        key={`${related.kind}:${related.id}`}
                        href={hrefWith(basePath, current, { signal: related.id })}
                        className="border border-border bg-background px-3 py-2 text-sm hover:border-foreground"
                      >
                        <span className="font-semibold">{related.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{KIND_LABELS[related.kind]}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-7 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="editorial-kicker">Evidence</p><h3 className="mt-1 font-heading text-xl font-semibold">{selectedPeriod ? `${cadence === "daily" ? "Day" : "Week"} of ${formatDate(selectedPeriod)}` : "Important announcements and sources"}</h3></div>{selectedPeriod ? <Button variant="ghost" size="sm" onClick={() => setSelectedPeriod(null)}><X className="size-3" /> Clear period</Button> : null}</div>
                {selectedEvidence.length ? (
                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {selectedEvidence.map((item) => (
                      <li key={item.id} className="py-3">
                        <Link href={item.href} className="group block">
                          <p className="text-sm font-semibold group-hover:text-accent">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.date)} · {item.source}</p>
                          {item.passage ? <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground">{item.passage}</p> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-4 text-sm text-muted-foreground">No retained evidence is dated in this selected {cadence === "daily" ? "day" : "week"}. Clear the period to see the signal’s strongest evidence.</p>}
              </div>
            </article>
          ) : <div className="border border-dashed border-border px-6 py-20 text-center text-sm text-muted-foreground">Choose a signal to see its explanation and evidence.</div>}
        </div>
      </section>

      {query ? (
        <section>
          <div className="border-b border-foreground pb-3"><p className="editorial-kicker">Archive search</p><h2 className="mt-1 font-heading text-2xl font-semibold">Evidence matching “{query}”</h2><p className="mt-1 text-sm text-muted-foreground">Results explain why they matched and link to the retained source.</p></div>
          <div className="border-x border-b border-border">
            {searchResults.length ? searchResults.map((result) => (
              <Link key={result.id} href={result.href} className="block border-t border-border bg-card p-4 hover:bg-muted/50">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{result.matchReason ?? "Relevant passage"}</Badge>{result.sourceType ? <span className="text-xs text-muted-foreground">{result.sourceType}</span> : null}</div>
                <h3 className="mt-2 font-heading text-xl font-semibold">{result.title}</h3>
                {result.passage ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{result.passage}</p> : null}
                <p className="mt-3 text-xs text-muted-foreground">{result.source} · {formatDate(result.date)}</p>
              </Link>
            )) : <div className="border-t border-border px-6 py-14 text-center"><BookOpen className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">No retained evidence matched. Try a shorter name, acronym, system, or buyer.</p></div>}
          </div>
        </section>
      ) : null}
    </div>
  );
}
