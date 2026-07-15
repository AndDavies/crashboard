"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InteractiveTrendChart } from "@/components/dashboard/intelligence/trend-chart";
import {
  DIRECTION_LABELS,
  evidenceForChartPeriod,
  KIND_LABELS,
  signalChange,
  type TrendSignal,
} from "@/components/dashboard/intelligence/trend-ui-model";
import { publicSignalHref } from "@/lib/intelligence/public";

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

export function PublicSignalDetail({ signal }: { signal: TrendSignal }) {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const evidence = evidenceForChartPeriod(signal.evidence, selectedPeriod, "weekly");
  const change = signalChange(signal);

  return (
    <div className="space-y-10">
      <header className="border-b border-foreground pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{DIRECTION_LABELS[signal.direction]}</Badge>
          <span className="text-xs text-muted-foreground">
            {KIND_LABELS[signal.kind]} · {signal.evidenceStrength} evidence
          </span>
        </div>
        <h1 className="mt-4 max-w-4xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">
          {titleCase(signal.label)}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{signal.whyNow}</p>
      </header>

      <section className="grid gap-px border border-border bg-border sm:grid-cols-4" aria-label="Trend summary">
        <div className="bg-card p-5"><p className="font-mono text-2xl font-semibold">{signal.currentReach.toFixed(1)}%</p><p className="mt-1 text-xs text-muted-foreground">share of coverage</p><p className="mt-2 text-xs text-muted-foreground">Previously {signal.previousReach.toFixed(1)}% · {change >= 0 ? "+" : ""}{change.toFixed(1)} points</p></div>
        <div className="bg-card p-5"><p className="font-mono text-2xl font-semibold">{signal.stories}</p><p className="mt-1 text-xs text-muted-foreground">unique stories</p></div>
        <div className="bg-card p-5"><p className="font-mono text-2xl font-semibold">{signal.sources}</p><p className="mt-1 text-xs text-muted-foreground">independent sources</p></div>
        <div className="bg-card p-5"><p className="font-mono text-2xl font-semibold">{signal.actions}</p><p className="mt-1 text-xs text-muted-foreground">real-world actions</p></div>
      </section>

      <section>
        <div className="border-b border-foreground pb-3">
          <p className="editorial-kicker">Movement over time</p>
          <h2 className="mt-1 font-heading text-3xl font-semibold">Share of coverage</h2>
          <p className="mt-2 text-sm text-muted-foreground">Select a point to filter the supporting evidence to that week.</p>
        </div>
        <div className="mt-5">
          <InteractiveTrendChart signals={[signal]} selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriod} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em]">Why now</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.whyNow}</p></div>
        <div className="border-l-2 border-accent pl-4"><p className="text-xs font-semibold uppercase tracking-[0.12em]">Why it matters</p><p className="mt-2 text-sm leading-6">{signal.whyItMatters}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em]">What to watch</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.whatToWatch}</p></div>
      </section>

      {signal.related.length ? (
        <section>
          <div className="border-b border-foreground pb-3"><p className="editorial-kicker">Related</p><h2 className="mt-1 font-heading text-2xl font-semibold">Signals and terms</h2></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {signal.related.map((related) => (
              <Link key={`${related.kind}:${related.id}`} href={publicSignalHref(related)} className="group inline-flex min-h-10 items-center border border-border bg-card px-3 py-2 text-sm outline-none motion-safe:transition-colors hover:border-foreground hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="font-semibold">{related.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{KIND_LABELS[related.kind]}</span>
                <ArrowRight className="ml-2 size-3 text-muted-foreground motion-safe:transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-foreground pb-3">
          <div>
            <p className="editorial-kicker">Evidence</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">{selectedPeriod ? `Week of ${formatDate(selectedPeriod)}` : "Important announcements and sources"}</h2>
          </div>
          {selectedPeriod ? <Button variant="ghost" size="sm" onClick={() => setSelectedPeriod(null)}><X className="size-3" /> Clear week</Button> : null}
        </div>
        {evidence.length ? (
          <ol className="divide-y divide-border border-b border-border">
            {evidence.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="group grid gap-3 px-2 py-5 outline-none motion-safe:transition-colors hover:bg-card/80 focus-visible:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
                  <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
                  <span>
                    <span className="block font-heading text-xl font-semibold motion-safe:transition-colors group-hover:text-accent group-focus-visible:text-accent">{item.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.source}</span>
                    {item.passage ? <span className="mt-2 line-clamp-3 block text-sm leading-6 text-muted-foreground">{item.passage}</span> : null}
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        ) : <p className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">No retained evidence is dated in this week. Clear the week to see the strongest evidence.</p>}
      </section>
    </div>
  );
}
