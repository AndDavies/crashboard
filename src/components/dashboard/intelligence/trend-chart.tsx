"use client";

import { useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
  type TooltipContentProps,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  chartBucketForDate,
  type TrendSeriesPoint,
  type TrendSignal,
} from "./trend-ui-model";

const SERIES_STYLES = [
  { colour: "#8fb51f", dash: undefined },
  { colour: "var(--foreground)", dash: "9 4" },
  { colour: "#9d5b32", dash: "3 3" },
  { colour: "#2c67a6", dash: "12 4 2 4" },
  { colour: "#7a4d9f", dash: "2 5" },
];

type ChartRow = {
  date: string;
  [signalId: string]: string | number | TrendSeriesPoint;
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00Z`),
  );
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function mergeSeries(signals: TrendSignal[]): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  for (const signal of signals) {
    for (const point of signal.series) {
      const row = rows.get(point.date) ?? { date: point.date };
      row[signal.id] = point.reach;
      row[`${signal.id}:detail`] = point;
      rows.set(point.date, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ChartTooltip({
  active,
  label,
  payload,
}: TooltipContentProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="max-w-[310px] border border-foreground bg-background p-3 text-xs shadow-lg">
      <p className="font-semibold">{longDate(String(label))}</p>
      <div className="mt-2 space-y-2">
        {payload.map((entry) => {
          const row = entry.payload as ChartRow;
          const point = row[`${String(entry.dataKey)}:detail`] as TrendSeriesPoint | undefined;
          return (
            <div key={String(entry.dataKey)} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
              <p className="font-medium" style={{ color: entry.color }}>{entry.name}</p>
              <p className="mt-1">{Number(entry.value).toFixed(1)}% of coverage{point ? ` · ${point.change >= 0 ? "+" : ""}${point.change.toFixed(1)} points` : ""}</p>
              {point ? <p className="mt-1 text-muted-foreground">{point.stories} stories · {point.sources} sources · {point.actions} actions</p> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-muted-foreground">Select this point to filter the evidence.</p>
    </div>
  );
}

export function InteractiveTrendChart({
  signals,
  selectedPeriod,
  onSelectPeriod,
  className,
}: {
  signals: TrendSignal[];
  selectedPeriod?: string | null;
  onSelectPeriod?: (date: string) => void;
  className?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [focusedPoint, setFocusedPoint] = useState<{
    signal: string;
    point: TrendSeriesPoint;
  } | null>(null);
  const data = useMemo(() => mergeSeries(signals), [signals]);

  if (!signals.length || !data.length) {
    return (
      <div className={cn("border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground", className)}>
        There is not enough history to draw this comparison yet.
      </div>
    );
  }

  function toggleSignal(id: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isolateSignal(id: string) {
    setHidden((current) => {
      const others = signals.filter((signal) => signal.id !== id).map((signal) => signal.id);
      const alreadyIsolated = others.every((signalId) => current.has(signalId)) && !current.has(id);
      return alreadyIsolated ? new Set() : new Set(others);
    });
  }

  return (
    <div className={className}>
      <div className="h-[390px] w-full" aria-label="Interactive chart of share of coverage over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 28, right: 16, bottom: 12, left: 0 }}
            onClick={(state) => {
              if (state?.activeLabel && onSelectPeriod) onSelectPeriod(String(state.activeLabel));
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={26}
            />
            <YAxis
              unit="%"
              width={42}
              domain={[0, "auto"]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={ChartTooltip} />
            <Legend
              verticalAlign="top"
              align="left"
              wrapperStyle={{ paddingBottom: 18 }}
              content={({ payload }) => (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Chart lines">
                  {payload?.map((item) => {
                    const id = String(item.dataKey);
                    const isHidden = hidden.has(id);
                    return (
                      <span key={id} className={cn("inline-flex border border-border text-xs transition-opacity", isHidden && "opacity-40")}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 px-2.5 py-1"
                          onClick={() => toggleSignal(id)}
                          aria-pressed={!isHidden}
                          title={isHidden ? `Show ${item.value}` : `Hide ${item.value}`}
                        >
                          <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />
                          {item.value}
                        </button>
                        {signals.length > 1 ? (
                          <button type="button" className="border-l border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide" onClick={() => isolateSignal(id)} aria-label={`Show only ${item.value}`}>
                            Only
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              )}
            />
            {signals.flatMap((signal) =>
              signal.annotations.flatMap((annotation) => {
                const chartDate = chartBucketForDate(
                  signal.series.map((point) => point.date),
                  annotation.date,
                );
                if (!chartDate) return [];
                return [(
                <ReferenceLine
                  key={`${signal.id}:${annotation.date}:${annotation.type}`}
                  x={chartDate}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="2 4"
                  label={{
                    value: annotation.label,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
                )];
              }),
            )}
            {selectedPeriod ? (
              <ReferenceLine x={selectedPeriod} stroke="var(--foreground)" strokeWidth={2} />
            ) : null}
            {signals.map((signal, index) => {
              const style = SERIES_STYLES[index % SERIES_STYLES.length]!;
              return (
                <Line
                  key={signal.id}
                  type="monotone"
                  dataKey={signal.id}
                  name={signal.label}
                  hide={hidden.has(signal.id)}
                  connectNulls
                  stroke={style.colour}
                  strokeWidth={index === 0 ? 3 : 2.25}
                  strokeDasharray={style.dash}
                  isAnimationActive={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  dot={(props: DotItemDotProps) => {
                    const point = props.payload?.[`${signal.id}:detail`] as TrendSeriesPoint | undefined;
                    if (!point || typeof props.cx !== "number" || typeof props.cy !== "number") return <g />;
                    const label = `${signal.label}, ${longDate(point.date)}, ${point.reach.toFixed(1)} percent of coverage, ${point.stories} stories, ${point.sources} sources`;
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill={style.colour}
                        stroke="var(--background)"
                        strokeWidth={1.5}
                        tabIndex={0}
                        role="button"
                        aria-label={label}
                        onFocus={() => setFocusedPoint({ signal: signal.label, point })}
                        onBlur={() => setFocusedPoint(null)}
                        onClick={() => onSelectPeriod?.(point.date)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectPeriod?.(point.date);
                          }
                        }}
                      />
                    );
                  }}
                />
              );
            })}
            {data.length > 7 ? (
              <Brush
                dataKey="date"
                height={22}
                travellerWidth={8}
                tickFormatter={shortDate}
                stroke="var(--muted-foreground)"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="min-h-10 border-t border-border px-1 pt-3 text-xs" aria-live="polite">
        {focusedPoint ? (
          <p>
            <strong>{focusedPoint.signal}</strong> on {longDate(focusedPoint.point.date)}: {focusedPoint.point.reach.toFixed(1)}% of coverage, {focusedPoint.point.stories} stories, {focusedPoint.point.sources} sources, and {focusedPoint.point.actions} actions.
          </p>
        ) : (
          <p className="text-muted-foreground">Hover over a line, focus a point, or select a date to inspect its evidence. Drag the handles to zoom.</p>
        )}
      </div>

      <details className="mt-4 border-t border-border pt-3 text-xs">
        <summary className="cursor-pointer font-semibold">View the same values as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-foreground">
                <th className="py-2 pr-4">Date</th>
                {signals.map((signal) => <th key={signal.id} className="px-3 py-2">{signal.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date} className="border-b border-border">
                  <td className="py-2 pr-4">{longDate(row.date)}</td>
                  {signals.map((signal) => {
                    const point = row[`${signal.id}:detail`] as TrendSeriesPoint | undefined;
                    return (
                      <td key={signal.id} className="px-3 py-2">
                        {point ? `${point.reach.toFixed(1)}% · ${point.change >= 0 ? "+" : ""}${point.change.toFixed(1)} points · ${point.stories} stories · ${point.sources} sources · ${point.actions} actions` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
