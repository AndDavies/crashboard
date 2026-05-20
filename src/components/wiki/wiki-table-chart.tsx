import type { PublicWikiChart } from "@/lib/public-wiki/types";

export function WikiTableChart({ chart }: { chart: PublicWikiChart }) {
  const max = Math.max(...chart.values, 1);
  const min = Math.min(...chart.values, 0);
  const niceMax = Math.ceil(max);

  return (
    <figure className="my-8 border border-border/80 bg-card/70">
      <figcaption className="flex flex-col gap-1 border-b border-border/80 px-5 py-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Generated chart
        </span>
        <span className="font-heading text-base font-semibold text-foreground">
          {chart.title}
        </span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Range {min.toLocaleString()} – {niceMax.toLocaleString()}
        </span>
      </figcaption>
      <div className="space-y-2 px-5 py-4" role="list">
        {chart.labels.map((label, index) => {
          const value = chart.values[index] ?? 0;
          const ratio = max > 0 ? value / max : 0;
          const width = Math.max(0.5, ratio * 100);
          return (
            <div
              key={`${chart.id}-${label}`}
              role="listitem"
              aria-label={`${label}: ${value.toLocaleString()}`}
              className="grid items-center gap-3 sm:grid-cols-[10rem_1fr_5rem]"
            >
              <p className="truncate text-xs font-medium text-foreground">
                {label}
              </p>
              <div className="relative h-2.5 bg-muted/60">
                <div
                  className="h-full bg-accent motion-safe:transition-[width] motion-safe:duration-500"
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="text-xs font-medium tabular-nums text-foreground sm:text-right">
                {value.toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border/80 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {chart.values.length} {chart.values.length === 1 ? "row" : "rows"}
      </div>
    </figure>
  );
}
