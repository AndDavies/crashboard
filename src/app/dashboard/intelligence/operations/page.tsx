import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { OperationsControls } from "@/components/dashboard/intelligence/operations-controls";
import { getIntelligenceOperations } from "@/lib/intelligence/data";

export const metadata: Metadata = { title: "Intelligence Operations · Crashboard" };
export const dynamic = "force-dynamic";

export default async function IntelligenceOperationsPage() {
  const data = await getIntelligenceOperations();
  return (
    <div className="space-y-8 pb-14">
      <section className="border-b border-foreground/80 pb-6"><p className="editorial-kicker">Trend intelligence / operations</p><h1 className="mt-2 font-heading text-4xl font-semibold">Sources, checkpoints, runs, and watchlists.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Every ingestion batch is resumable and accounted for. Partial runs retain their checkpoint and exact failure count.</p></section>

      <section><div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Source registry</p><h2 className="mt-1 font-heading text-2xl font-semibold">Connected and discovered sources</h2></div><div className="border-x border-b border-border">{data.sources.length ? data.sources.map((source) => {
        const config = (source.config ?? {}) as Record<string, unknown>;
        const candidates = Array.isArray(config.candidate_senders) ? config.candidate_senders.length : 0;
        const checkpoint = (source.checkpoint ?? {}) as Record<string, unknown>;
        return <div key={source.id} className="grid gap-3 border-t border-border bg-card p-4 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-lg font-semibold">{source.name}</h3><Badge variant={source.status === "active" ? "default" : "outline"}>{source.status}</Badge></div><p className="mt-1 font-mono text-xs text-muted-foreground">{source.source_type} · {candidates} candidate senders · {checkpoint.next_page_token ? "checkpoint active" : "checkpoint clear"}</p>{source.last_error ? <p className="mt-2 text-sm text-destructive">{source.last_error}</p> : null}</div><div className="font-mono text-xs text-muted-foreground md:text-right">{source.last_synced_at ? String(source.last_synced_at).replace("T", " ").slice(0, 16) : "Never synced"}</div></div>;
      }) : <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">No connected sources.</div>}</div></section>

      <section><div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Watchlists</p><h2 className="mt-1 font-heading text-2xl font-semibold">Saved intelligence questions</h2></div><div className="mt-4"><OperationsControls watchlists={data.watchlists as never[]} /></div></section>

      <section className="grid gap-5 xl:grid-cols-2"><div><div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Run ledger</p><h2 className="mt-1 font-heading text-2xl font-semibold">Recent ingestion</h2></div><div className="border-x border-b border-border">{data.runs.length ? data.runs.slice(0, 20).map((run) => <div key={run.id} className="border-t border-border bg-card p-4"><div className="flex items-center justify-between gap-4"><span className="capitalize font-medium">{String(run.run_type).replaceAll("_", " ")}</span><Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge></div><div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground"><span>{run.processed_count} processed</span><span>{run.failed_count} failed</span><span>{run.excluded_count} excluded</span><span>{String(run.created_at).slice(0, 16).replace("T", " ")}</span></div></div>) : <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">No runs yet.</div>}</div></div>
      <div><div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Digest ledger</p><h2 className="mt-1 font-heading text-2xl font-semibold">Daily delivery</h2></div><div className="border-x border-b border-border">{data.digests.length ? data.digests.map((digest) => <div key={digest.id} className="border-t border-border bg-card p-4"><div className="flex items-center justify-between gap-4"><span className="font-medium">{digest.subject}</span><Badge variant={digest.status === "failed" ? "destructive" : "outline"}>{digest.status}</Badge></div><p className="mt-2 font-mono text-xs text-muted-foreground">{digest.sent_at ? String(digest.sent_at).slice(0, 16).replace("T", " ") : digest.digest_date}</p>{digest.error_message ? <p className="mt-2 text-sm text-destructive">{digest.error_message}</p> : null}</div>) : <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">No digests yet.</div>}</div></div></section>
    </div>
  );
}
