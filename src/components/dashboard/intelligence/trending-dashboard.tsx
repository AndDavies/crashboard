import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleDot,
  Database,
  Lightbulb,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TrendingAnalysis, TrendingTopic } from "@/lib/intelligence/trending-analysis";

const CHART_COLORS = ["#b7f52a", "#141414", "#6f7b58", "#a56842"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function directionLabel(topic: TrendingTopic) {
  if (topic.direction === "emerging") return "Newly emerging";
  if (topic.direction === "cooling") return "Cooling";
  if (topic.direction === "steady") return "High attention";
  return "Rising";
}

function DirectionIcon({ direction }: { direction: TrendingTopic["direction"] }) {
  if (direction === "cooling") return <ArrowDownRight className="size-4" aria-hidden="true" />;
  if (direction === "steady") return <CircleDot className="size-4" aria-hidden="true" />;
  return <ArrowUpRight className="size-4" aria-hidden="true" />;
}

function TrendChart({ topics }: { topics: TrendingTopic[] }) {
  if (!topics.length) return <p className="py-16 text-center text-sm text-muted-foreground">Not enough data to draw a trend yet.</p>;
  const width = 920;
  const height = 330;
  const margin = { top: 20, right: 18, bottom: 42, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const max = Math.max(5, ...topics.flatMap((topic) => topic.weekly.map((point) => point.share)));
  const yMax = Math.ceil(max / 5) * 5;
  const points = topics[0]?.weekly ?? [];
  const x = (index: number) => margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number) => margin.top + plotHeight - (value / yMax) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio));

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {topics.map((topic, index) => (
          <div key={topic.key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index] }} />
            <span>{titleCase(topic.label)}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[680px]"
          role="img"
          aria-label="Twelve-week chart showing the share of articles mentioning the fastest-rising topics"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth="1" />
              <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{tick}%</text>
            </g>
          ))}
          {points.map((point, index) => index % 2 === 0 || index === points.length - 1 ? (
            <text key={point.period} x={x(index)} y={height - 13} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {formatShortDate(point.period)}
            </text>
          ) : null)}
          {topics.map((topic, topicIndex) => {
            const path = topic.weekly.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point.share)}`).join(" ");
            return (
              <g key={topic.key}>
                <path d={path} fill="none" stroke={CHART_COLORS[topicIndex]} strokeWidth={topicIndex === 0 ? 4 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
                {topic.weekly.map((point, index) => (
                  <circle key={point.period} cx={x(index)} cy={y(point.share)} r={topicIndex === 0 ? 3.5 : 2.5} fill={CHART_COLORS[topicIndex]} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">View chart values</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead><tr><th className="py-2">Week starting</th>{topics.map((topic) => <th key={topic.key} className="px-2 py-2">{titleCase(topic.label)}</th>)}</tr></thead>
            <tbody>{points.map((point, index) => <tr key={point.period} className="border-t border-border"><td className="py-2">{formatShortDate(point.period)}</td>{topics.map((topic) => <td key={topic.key} className="px-2 py-2">{topic.weekly[index]?.share.toFixed(1)}%</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TopicCard({ topic, rank, compact = false }: { topic: TrendingTopic; rank?: number; compact?: boolean }) {
  const positive = topic.changePoints >= 0;
  const exploreHref = `/dashboard/intelligence/explorer?q=${encodeURIComponent(topic.label)}`;
  return (
    <article className="border-t border-foreground/80 py-6 first:border-t-0 first:pt-0">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {typeof rank === "number" ? <span className="font-mono text-xs text-muted-foreground">{String(rank).padStart(2, "0")}</span> : null}
            <Badge variant={topic.direction === "cooling" ? "outline" : "default"} className="gap-1">
              <DirectionIcon direction={topic.direction} /> {directionLabel(topic)}
            </Badge>
            <span className="text-xs capitalize text-muted-foreground">{topic.conceptType}</span>
          </div>
          <h3 className="mt-3 font-heading text-2xl font-semibold">{titleCase(topic.label)}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.why}</p>
          <div className="mt-4 border-l-2 border-accent pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">Why it matters</p>
            <p className="mt-1 text-sm leading-6">{topic.soWhat}</p>
          </div>
          {!compact && topic.evidence.length ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent evidence</p>
              <ul className="mt-2 space-y-2">
                {topic.evidence.slice(0, 2).map((item) => (
                  <li key={item.id}>
                    <Link href={`/dashboard/intelligence/documents/${item.id}`} className="group inline-flex items-start gap-2 text-sm leading-5 hover:text-accent">
                      <BookOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>{item.title} <span className="text-xs text-muted-foreground">· {formatShortDate(item.publishedAt.slice(0, 10))}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="border-l border-border pl-5 lg:text-right">
          <p className={`font-mono text-3xl font-semibold ${positive ? "text-foreground" : "text-muted-foreground"}`}>
            {positive ? "+" : ""}{topic.changePoints.toFixed(1)}
          </p>
          <p className="text-xs text-muted-foreground">percentage points</p>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p><strong className="text-foreground">{topic.currentShare.toFixed(1)}%</strong> of recent articles</p>
            <p>{topic.currentDocuments} articles · {topic.sourceCount} sources</p>
          </div>
          <Link href={exploreHref} className="mt-5 inline-flex items-center gap-1 text-xs font-semibold hover:text-accent">
            See the evidence <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function EmptySection({ children }: { children: string }) {
  return <p className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function TrendingDashboard({
  data,
  mode,
  query = "",
}: {
  data: TrendingAnalysis;
  mode: "overview" | "all";
  query?: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-CA");
  const matches = (topic: TrendingTopic) => !normalizedQuery || topic.label.toLocaleLowerCase("en-CA").includes(normalizedQuery);
  const rising = [...data.emerging, ...data.rising]
    .filter(matches)
    .sort((a, b) => b.changePoints - a.changePoints || b.currentDocuments - a.currentDocuments);
  const steady = data.steady.filter(matches);
  const cooling = data.cooling.filter(matches);
  const lead = rising[0] ?? steady[0] ?? cooling[0];
  const chartTopics = rising.slice(0, 4);

  if (mode === "overview") {
    return (
      <div className="space-y-10 pb-14">
        <header className="border-b border-foreground/80 pb-7">
          <p className="editorial-kicker">Intelligence / current direction</p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-end">
            <div>
              <h1 className="max-w-4xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">What is gaining momentum?</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                A plain-language view of which topics are appearing in more of your intelligence articles—and why that change matters.
              </p>
            </div>
            <div className="border-l-2 border-accent pl-4 text-sm">
              <p className="font-semibold">Last 4 weeks vs previous 4</p>
              <p className="mt-1 text-muted-foreground">Updated through {formatDate(data.completeThrough)}</p>
            </div>
          </div>
        </header>

        {lead ? (
          <section className="grid gap-6 border border-foreground bg-foreground p-6 text-background md:grid-cols-[1fr_210px] md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Strongest movement</p>
              <h2 className="mt-3 font-heading text-3xl font-semibold sm:text-4xl">{titleCase(lead.label)}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-background/70">{lead.why}</p>
              <div className="mt-5 border-l-2 border-accent pl-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em]">So what</p>
                <p className="mt-1 max-w-2xl text-sm leading-6">{lead.soWhat}</p>
              </div>
            </div>
            <div className="border-t border-background/20 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p className="font-mono text-5xl font-semibold text-accent">+{lead.changePoints.toFixed(1)}</p>
              <p className="mt-1 text-xs text-background/60">percentage points</p>
              <p className="mt-6 text-sm"><strong>{lead.currentShare.toFixed(1)}%</strong> of recent articles</p>
              <p className="mt-1 text-xs text-background/60">{lead.currentDocuments} articles · {lead.sourceCount} sources</p>
            </div>
          </section>
        ) : <EmptySection>No supported trends are available yet.</EmptySection>}

        {rising.length ? (
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="editorial-kicker">Trending terms</p>
                <h2 className="mt-1 font-heading text-2xl font-semibold">Fast scan</h2>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Change in share of articles</p>
            </div>
            <div className="grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-4">
              {rising.slice(0, 8).map((topic) => (
                <div key={topic.key} className="border-b border-r border-border bg-card p-4">
                  <p className="text-sm font-semibold">{titleCase(topic.label)}</p>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <span className="text-xs capitalize text-muted-foreground">{topic.conceptType}</span>
                    <span className="font-mono text-sm font-semibold">+{topic.changePoints.toFixed(1)} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-foreground/80 pb-3">
            <div>
              <p className="editorial-kicker">Direction over time</p>
              <h2 className="mt-1 font-heading text-3xl font-semibold">The fastest-rising topics</h2>
              <p className="mt-2 text-sm text-muted-foreground">Each line is the percentage of that week’s articles mentioning the topic.</p>
            </div>
            <Link
              href="/dashboard/intelligence/trends"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[2px] border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              View all trends <ArrowRight className="size-4" />
            </Link>
          </div>
          <TrendChart topics={chartTopics} />
        </section>

        <section>
          <div className="mb-5 border-b border-foreground/80 pb-3">
            <p className="editorial-kicker">Analyst brief</p>
            <h2 className="mt-1 font-heading text-3xl font-semibold">What changed, and why it matters</h2>
          </div>
          {rising.length ? rising.slice(0, 5).map((topic, index) => <TopicCard key={topic.key} topic={topic} rank={index + 1} compact />) : <EmptySection>No topics have a supported increase in the latest period.</EmptySection>}
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <div className="border border-border bg-card p-5">
            <ArrowUpRight className="size-5" aria-hidden="true" />
            <p className="mt-5 font-mono text-3xl font-semibold">{data.rising.length + data.emerging.length}</p>
            <p className="mt-1 text-sm font-medium">topics gaining attention</p>
          </div>
          <div className="border border-border bg-card p-5">
            <BookOpen className="size-5" aria-hidden="true" />
            <p className="mt-5 font-mono text-3xl font-semibold">{data.currentDocumentCount}</p>
            <p className="mt-1 text-sm font-medium">articles in the latest comparison</p>
          </div>
          <div className="border border-border bg-card p-5">
            <Database className="size-5" aria-hidden="true" />
            <p className="mt-5 font-mono text-3xl font-semibold">{data.currentSourceCount}</p>
            <p className="mt-1 text-sm font-medium">independent sources represented</p>
          </div>
        </section>

        <section className="border-t border-border pt-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2"><Lightbulb className="size-4" /><h2 className="font-semibold">How to read this</h2></div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">A topic is rising when its share of articles increased by at least 0.7 percentage points and it appeared across at least two independent sources. This measures attention, not market size or proven causation.</p>
            </div>
            <div>
              <div className="flex items-center gap-2"><Database className="size-4" /><h2 className="font-semibold">Next data priority</h2></div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Add official procurement portals and government releases first. They provide direct confirmation of budgets, buyers, deadlines, and awards—and reduce reliance on repeated newsletter coverage.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-9 pb-14">
      <header className="border-b border-foreground/80 pb-7">
        <p className="editorial-kicker">Intelligence / all trends</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold sm:text-5xl">What is trending?</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">Topics ranked by how much their share of coverage changed in the last four weeks.</p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span><strong className="text-foreground">Comparison:</strong> {formatShortDate(data.currentStart)}–{formatShortDate(data.completeThrough)} vs previous 4 weeks</span>
          <span><strong className="text-foreground">Evidence:</strong> {data.currentDocumentCount} recent articles from {data.currentSourceCount} sources</span>
        </div>
      </header>

      <form className="flex max-w-xl gap-2" action="/dashboard/intelligence/trends">
        <label className="sr-only" htmlFor="trend-search">Search topics</label>
        <Input id="trend-search" name="q" defaultValue={query} placeholder="Search a topic or keyword" />
        <Button type="submit" variant="outline"><Search className="size-4" /> Search</Button>
      </form>

      {normalizedQuery && !rising.length && !steady.length && !cooling.length ? <EmptySection>No trends match that search.</EmptySection> : null}

      {rising.length ? (
        <section>
          <div className="mb-5 border-b border-foreground/80 pb-3"><p className="editorial-kicker">Increasing</p><h2 className="mt-1 font-heading text-3xl font-semibold">Gaining attention</h2></div>
          {rising.map((topic, index) => <TopicCard key={topic.key} topic={topic} rank={index + 1} />)}
        </section>
      ) : null}

      {steady.length ? (
        <section>
          <div className="mb-5 border-b border-foreground/80 pb-3"><p className="editorial-kicker">Still important</p><h2 className="mt-1 font-heading text-3xl font-semibold">High, steady attention</h2></div>
          {steady.slice(0, normalizedQuery ? 30 : 10).map((topic) => <TopicCard key={topic.key} topic={topic} compact />)}
        </section>
      ) : null}

      {cooling.length ? (
        <section>
          <div className="mb-5 border-b border-foreground/80 pb-3"><p className="editorial-kicker">Decreasing</p><h2 className="mt-1 font-heading text-3xl font-semibold">Losing attention</h2></div>
          {cooling.slice(0, normalizedQuery ? 30 : 12).map((topic) => <TopicCard key={topic.key} topic={topic} compact />)}
        </section>
      ) : null}
    </div>
  );
}
