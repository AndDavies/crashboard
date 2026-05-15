import type { PublicWikiChart } from "@/lib/public-wiki/types";

export function WikiTableChart({ chart }: { chart: PublicWikiChart }) {
  const max = Math.max(...chart.values, 1);

  return (
    <div className="my-8 rounded-lg border border-border/80 bg-card/70 p-4 transition-all duration-300 hover:border-primary/25 hover:shadow-sm">
      <div className="flex flex-col gap-1 border-b border-border/70 pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Generated chart
        </p>
        <h3 className="font-heading text-base font-semibold text-foreground">
          {chart.title}
        </h3>
      </div>
      <div className="mt-4 space-y-3">
        {chart.labels.map((label, index) => {
          const value = chart.values[index] ?? 0;
          return (
            <div key={`${chart.id}-${label}`} className="group grid gap-2 sm:grid-cols-[12rem_1fr_4rem] sm:items-center">
              <p className="truncate text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <div className="h-3 overflow-hidden rounded-full bg-muted transition-colors group-hover:bg-secondary">
                <div
                  className="h-full rounded-full bg-[color-mix(in_oklch,var(--accent)_74%,var(--primary))] transition-all duration-500 group-hover:bg-primary motion-reduce:transition-none"
                  style={{ width: `${Math.max(5, (value / max) * 100)}%` }}
                />
              </div>
              <p className="text-xs font-semibold tabular-nums text-foreground sm:text-right">
                {value.toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
