"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveTrendChart } from "./trend-chart";
import type { TrendSignal } from "./trend-ui-model";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00Z`),
  );
}

export function OverviewTrendChart({ signals }: { signals: TrendSignal[] }) {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const evidence = useMemo(() => {
    if (!selectedPeriod) return [];
    const start = Date.parse(`${selectedPeriod}T00:00:00Z`);
    return signals.flatMap((signal) =>
      signal.evidence
        .filter((item) => {
          const date = Date.parse(item.date);
          return date >= start && date < start + WEEK_MS;
        })
        .map((item) => ({ ...item, signal: signal.label })),
    );
  }, [selectedPeriod, signals]);

  return (
    <div>
      <InteractiveTrendChart
        signals={signals}
        selectedPeriod={selectedPeriod}
        onSelectPeriod={setSelectedPeriod}
      />
      {selectedPeriod ? (
        <div className="mt-5 border border-foreground bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="editorial-kicker">Evidence in this period</p>
              <h3 className="mt-1 font-heading text-xl font-semibold">Week of {shortDate(selectedPeriod)}</h3>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelectedPeriod(null)} aria-label="Clear selected period">
              <X className="size-4" />
            </Button>
          </div>
          {evidence.length ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {evidence.slice(0, 8).map((item) => (
                <li key={`${item.signal}:${item.id}`} className="py-3">
                  <Link href={item.href} className="group flex items-start justify-between gap-4 text-sm font-medium hover:text-accent">
                    <span>{item.title}<span className="ml-2 text-xs font-normal text-muted-foreground">{item.signal}</span></span>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No retained evidence is dated in this exact week. The line still reflects all qualifying items counted in that period.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

