import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalComparisonChart } from "@/components/dashboard/intelligence/signal-chart";
import { getTrendDetail } from "@/lib/intelligence/signal-data";

export const metadata: Metadata = { title: "Signal Detail · Trend Intelligence" };
export const dynamic = "force-dynamic";

function pct(value: unknown, digits = 1) { return `${Number(value ?? 0).toFixed(digits)}%`; }

export default async function TrendDetailPage({ params }: { params: Promise<{ trendKey: string }> }) {
  const { trendKey } = await params;
  const data = await getTrendDetail(decodeURIComponent(trendKey));
  if (!data) notFound();
  const current = data.current as Record<string, unknown>;
  const metadata = current.metadata as Record<string, unknown>;
  const weekly = data.history.filter((row) => row.window_type === "weekly");
  return (
    <article className="space-y-8 pb-14">
      <header className="border-b border-foreground/80 pb-7">
        <div className="flex flex-wrap items-center gap-2"><Badge>{String(current.domain).replaceAll("_", " ")}</Badge><Badge variant={current.qualification_status === "qualified" ? "default" : "outline"}>{String(current.qualification_status).replaceAll("_", " ")}</Badge>{current.novelty ? <Badge variant="secondary">New signal</Badge> : null}</div>
        <h1 className="mt-5 max-w-5xl font-heading text-4xl font-semibold leading-tight">{String(current.trend_label)}</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">Operating window {String(current.period_start)} to {String(current.period_end)}, compared with {String(metadata.baseline_start ?? "the preceding baseline")} to {String(metadata.baseline_end ?? "")}. Current-day partial data is excluded; archive complete through {data.completeThrough}.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[ ["Signal strength", Math.round(Number(current.trend_strength))], ["Mention rate", pct(current.mention_rate)], ["Baseline rate", pct(metadata.baseline_mention_rate)], ["Evidence", `${current.supporting_document_count} / ${current.eligible_document_count}`], ["Source families", current.independent_source_count], ["Event rate", pct(current.event_rate)] ].map(([label, value]) => <Card key={String(label)}><CardHeader><CardDescription>{String(label)}</CardDescription><CardTitle className="font-mono text-xl">{String(value)}</CardTitle></CardHeader></Card>)}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.8fr]">
        <Card><CardHeader><CardTitle>Weekly movement</CardTitle><CardDescription>Mentions per 100 eligible evidence units across complete weeks.</CardDescription></CardHeader><CardContent><SignalComparisonChart rows={weekly as never} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Evidence quality</CardTitle><CardDescription>Why this signal is or is not qualified.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between border-b border-border pb-2"><span>Evidence confidence</span><span className="font-mono">{pct(Number(current.evidence_confidence) * 100)}</span></div><div className="flex justify-between border-b border-border pb-2"><span>Largest publisher share</span><span className="font-mono">{pct(Number(current.publisher_concentration) * 100)}</span></div><div className="flex justify-between border-b border-border pb-2"><span>Effective sources</span><span className="font-mono">{Number(current.effective_source_count).toFixed(1)}</span></div><div className="flex justify-between border-b border-border pb-2"><span>95% prevalence interval</span><span className="font-mono">{pct(Number(current.confidence_low) * 100)}–{pct(Number(current.confidence_high) * 100)}</span></div><div className="flex justify-between"><span>Increase probability</span><span className="font-mono">{pct(Number(metadata.increase_probability) * 100)}</span></div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Source-family contribution</CardTitle><CardDescription>Document support—not raw repeated mentions.</CardDescription></CardHeader><CardContent className="space-y-3">{data.sourceMix.slice(0, 12).map((row) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{row.label}</span><span className="font-mono">{row.count}</span></div><div className="h-1.5 bg-muted"><div className="h-full bg-accent" style={{ width: `${100 * row.count / Math.max(1, data.sourceMix[0]?.count ?? 1)}%` }} /></div></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Related qualified concepts</CardTitle><CardDescription>Co-occurrence requires support, source diversity, lift, and false-discovery control.</CardDescription></CardHeader><CardContent className="space-y-3">{data.related.slice(0, 10).map((row) => { const item = row as Record<string, unknown>; const currentId = String(metadata.subject_id ?? ""); const relatedId = String(item.subject_a_id) === currentId ? String(item.subject_b_id) : String(item.subject_a_id); return <Link key={String(item.id)} href={`/dashboard/intelligence/trends/${encodeURIComponent(`concept:${relatedId}`)}`} className="flex items-center justify-between border-b border-border pb-2 last:border-0"><span>{String(item.related_label ?? "Related concept")}</span><span className="font-mono text-xs text-muted-foreground">lift {Number(item.lift).toFixed(2)} · nPMI {Number(item.npmi).toFixed(2)}</span></Link>; })}{!data.related.length ? <p className="py-8 text-center text-sm text-muted-foreground">No related pair passes the evidence gates yet.</p> : null}</CardContent></Card>
      </section>

      {data.cases.length ? <section><div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Action chain</p><h2 className="mt-1 font-heading text-2xl font-semibold">Procurement lifecycle</h2></div><div className="border-x border-b border-border">{data.cases.map((row, index) => { const item = row as unknown as { stage: string; transition_at: string | null; intelligence_procurement_cases: Record<string, unknown> | null }; const procurementCase = item.intelligence_procurement_cases ?? {}; return <div key={`${procurementCase.id}-${index}`} className="grid gap-2 border-t border-border bg-card p-4 sm:grid-cols-[9rem_1fr_auto]"><div><Badge variant="outline">{item.stage.replaceAll("_", " ")}</Badge></div><div className="font-medium">{String(procurementCase.title)}</div><div className="font-mono text-xs text-muted-foreground">{item.transition_at?.slice(0, 10) ?? "Date unknown"}</div></div>; })}</div></section> : null}

      <section><div className="flex items-end justify-between gap-4 border-b border-foreground/80 pb-3"><div><p className="editorial-kicker">Evidence</p><h2 className="mt-1 font-heading text-2xl font-semibold">Supporting documents</h2></div><span className="text-sm text-muted-foreground">{data.documents.length} shown</span></div><div className="border-x border-b border-border">{data.documents.map((document) => <Link key={String(document.id)} href={`/dashboard/intelligence/documents/${document.id}`} className="grid gap-3 border-t border-border bg-card p-4 hover:bg-muted/50 md:grid-cols-[8rem_1fr_auto]"><div><Badge variant="outline">{String(document.source_type).replaceAll("_", " ")}</Badge><p className="mt-2 font-mono text-xs text-muted-foreground">{String(document.published_at ?? "").slice(0, 10)}</p></div><div><h3 className="font-heading text-lg font-semibold">{String(document.title ?? "Untitled evidence")}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{String(document.summary_short ?? "")}</p></div><div className="flex items-center gap-1 text-xs font-medium">Inspect <FileText className="size-3" /></div></Link>)}</div></section>

      {data.events.length ? <section><div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Material actions</p><h2 className="mt-1 font-heading text-2xl font-semibold">Linked events</h2></div><div className="border-x border-b border-border">{data.events.map((event) => <Link key={String(event.id)} href={`/dashboard/intelligence/events/${event.id}`} className="flex items-center justify-between gap-4 border-t border-border bg-card p-4 hover:bg-muted/50"><div><Badge variant="outline">{String(event.event_type).replaceAll("_", " ")}</Badge><h3 className="mt-2 font-medium">{String(event.title)}</h3></div><ArrowUpRight className="size-4" /></Link>)}</div></section> : null}
    </article>
  );
}
