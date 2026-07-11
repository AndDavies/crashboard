import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalComparisonChart } from "@/components/dashboard/intelligence/signal-chart";
import { getTrendExplorerData } from "@/lib/intelligence/signal-data";

export const metadata: Metadata = { title: "Trend Explorer · Crashboard" };
export const dynamic = "force-dynamic";

type SearchParams = { window?: string; channel?: string; domain?: string; status?: string; q?: string; compare?: string | string[] };

function percentage(value: unknown) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

export default async function TrendExplorerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const compare = Array.isArray(params.compare) ? params.compare : params.compare ? [params.compare] : [];
  const data = await getTrendExplorerData({ ...params, compare });
  return (
    <div className="space-y-7 pb-14">
      <header className="border-b border-foreground/80 pb-6">
        <p className="editorial-kicker">Trend intelligence / signal explorer</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold">See what is moving—and whether it matters.</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">Compare canonical terms, themes, capabilities, entities, event types, and procurement stages. Rates use explicit eligible denominators, source-family balancing, complete-day windows, and qualification gates.</p>
      </header>

      <form className="grid gap-3 border border-border bg-card p-4 md:grid-cols-6">
        <label className="text-xs font-medium">Window<select name="window" defaultValue={data.windowType} className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm"><option value="pulse">Pulse · 7 vs 28 days</option><option value="operating">Operating · 28 vs 84 days</option><option value="strategic">Strategic · 90 vs 90 days</option></select></label>
        <label className="text-xs font-medium">Channel<select name="channel" defaultValue={data.channel} className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm">{data.channels.map((channel) => <option key={channel} value={channel}>{channel.replaceAll("_", " ")}</option>)}</select></label>
        <label className="text-xs font-medium">Signal type<select name="domain" defaultValue={params.domain ?? "all"} className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm"><option value="all">All types</option>{data.domains.map((domain) => <option key={domain} value={domain}>{domain.replaceAll("_", " ")}</option>)}</select></label>
        <label className="text-xs font-medium">Quality<select name="status" defaultValue={data.status} className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm"><option value="qualified">Qualified only</option><option value="all">All signals</option><option value="insufficient_support">Insufficient support</option><option value="source_concentrated">Source concentrated</option><option value="incomplete_coverage">Incomplete coverage</option></select></label>
        <label className="text-xs font-medium md:col-span-2">Search<Input name="q" defaultValue={params.q ?? ""} placeholder="Counter-UAS, NATO, funding…" className="mt-1" /></label>
        <div className="md:col-span-6"><Button type="submit"><Search className="size-4" /> Apply filters</Button></div>
      </form>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Complete through</CardDescription><CardTitle className="font-mono text-xl">{data.completeThrough}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Current period ending</CardDescription><CardTitle className="font-mono text-xl">{data.periodEnd ?? "—"}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Analytics computed</CardDescription><CardTitle className="font-mono text-sm">{data.analyticsComputedAt?.slice(0, 16).replace("T", " ") ?? "—"}</CardTitle></CardHeader></Card>
      </section>

      <Card><CardHeader><CardTitle>Weekly comparison</CardTitle><CardDescription>Select up to four signals below, then apply filters. The line is mentions per 100 eligible evidence units.</CardDescription></CardHeader><CardContent><SignalComparisonChart rows={data.series as never} /></CardContent></Card>

      <form className="space-y-3">
        <input type="hidden" name="window" value={data.windowType} /><input type="hidden" name="channel" value={data.channel} /><input type="hidden" name="domain" value={params.domain ?? "all"} /><input type="hidden" name="status" value={data.status} /><input type="hidden" name="q" value={params.q ?? ""} />
        <div className="flex items-end justify-between gap-4 border-b border-foreground/80 pb-3"><div><p className="editorial-kicker">Signal register</p><h2 className="mt-1 font-heading text-2xl font-semibold">{data.rows.length} evidence-backed signals</h2></div><Button type="submit" variant="outline"><Activity className="size-4" /> Compare selected</Button></div>
        <div className="overflow-x-auto border border-border bg-card"><table className="w-full min-w-[980px] border-collapse text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-3">Compare</th><th className="p-3">Signal</th><th className="p-3 text-right">Strength</th><th className="p-3 text-right">Mention rate</th><th className="p-3 text-right">Baseline</th><th className="p-3 text-right">Evidence</th><th className="p-3 text-right">Sources</th><th className="p-3">Quality</th><th className="p-3"><span className="sr-only">Open</span></th></tr></thead><tbody>{data.rows.map((row) => { const metadata = row.metadata as Record<string, unknown>; return <tr key={String(row.trend_key)} className="border-b border-border last:border-0 hover:bg-muted/40"><td className="p-3"><input type="checkbox" name="compare" value={String(row.trend_key)} defaultChecked={data.seriesKeys.includes(String(row.trend_key))} aria-label={`Compare ${String(row.trend_label)}`} /></td><td className="p-3"><div className="font-medium">{String(row.trend_label)}</div><div className="mt-1 text-xs text-muted-foreground">{String(row.domain).replaceAll("_", " ")}</div></td><td className="p-3 text-right font-mono">{Math.round(Number(row.trend_strength))}</td><td className="p-3 text-right font-mono">{percentage(row.mention_rate)}</td><td className="p-3 text-right font-mono">{percentage(metadata.baseline_mention_rate)}</td><td className="p-3 text-right font-mono">{String(row.supporting_document_count)} / {String(row.eligible_document_count)}</td><td className="p-3 text-right font-mono">{String(row.independent_source_count)}</td><td className="p-3"><Badge variant={row.qualification_status === "qualified" ? "default" : "outline"}>{String(row.qualification_status).replaceAll("_", " ")}</Badge>{row.novelty ? <Badge variant="secondary" className="ml-1">new</Badge> : null}</td><td className="p-3 text-right"><Link href={`/dashboard/intelligence/trends/${encodeURIComponent(String(row.trend_key))}`} className="inline-flex items-center gap-1 font-medium hover:text-accent">Open <ArrowRight className="size-3" /></Link></td></tr>; })}</tbody></table>{!data.rows.length ? <p className="p-12 text-center text-sm text-muted-foreground">No signals match these filters.</p> : null}</div>
      </form>
    </div>
  );
}
