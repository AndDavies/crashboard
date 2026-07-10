import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EVENT_TYPE_LABELS } from "@/lib/intelligence/taxonomy";
import { getDefenceIntelligence } from "@/lib/intelligence/data";
import type { IntelligenceEventType } from "@/lib/intelligence/types";

export const metadata: Metadata = { title: "Defence Intelligence · Crashboard" };
export const dynamic = "force-dynamic";

function money(amount: unknown, currency: unknown) {
  if (amount === null || amount === undefined) return null;
  return `${String(currency ?? "")} ${new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(Number(amount))}`.trim();
}

export default async function DefenceIntelligencePage() {
  const events = await getDefenceIntelligence();
  const types = new Map<string, number>();
  const allied = events.filter((event) => event.canada_allied_relevance).length;
  for (const event of events) {
    const type = String(event.event_type);
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  const maxType = Math.max(...types.values(), 1);

  return (
    <div className="space-y-8 pb-14">
      <section className="border-b border-foreground/80 pb-6">
        <p className="editorial-kicker">Trend intelligence / defence and allied</p>
        <h1 className="mt-2 max-w-4xl font-heading text-4xl font-semibold">Capability movement across procurement, industry, and deployment.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          A dedicated view for defence, dual-use, Canada, NATO, NORAD, Five Eyes, industrial capacity, trials, and systems entering service.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-card p-4"><p className="editorial-kicker">Defence events</p><p className="mt-2 font-mono text-3xl font-semibold">{events.length}</p></div>
        <div className="border border-border bg-card p-4"><p className="editorial-kicker">Canada / allied</p><p className="mt-2 font-mono text-3xl font-semibold">{allied}</p></div>
        <div className="border border-border bg-card p-4"><p className="editorial-kicker">Lifecycle categories</p><p className="mt-2 font-mono text-3xl font-semibold">{types.size}</p></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.6fr]">
        <div className="border border-border bg-card p-4">
          <p className="editorial-kicker">Event mix</p>
          <div className="mt-5 space-y-4">
            {[...types.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type}>
                <div className="mb-1.5 flex justify-between gap-4 text-xs"><span>{EVENT_TYPE_LABELS[type as IntelligenceEventType]}</span><span className="font-mono">{count}</span></div>
                <div className="h-2 bg-muted"><div className="h-full bg-foreground" style={{ width: `${(count / maxType) * 100}%` }} /></div>
              </div>
            ))}
            {!types.size ? <p className="py-12 text-center text-sm text-muted-foreground">No defence events yet.</p> : null}
          </div>
        </div>
        <div className="border-x border-b border-border">
          {events.length ? events.map((event) => (
            <Link key={event.id} href={`/dashboard/intelligence/events/${event.id}`} className="block border-t border-border bg-card px-4 py-4 hover:bg-muted/50">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{EVENT_TYPE_LABELS[event.event_type as IntelligenceEventType]}</Badge>
                <Badge variant="secondary">{String(event.lifecycle_status).replaceAll("_", " ")}</Badge>
                {event.canada_allied_relevance ? <Badge>Canada / allied</Badge> : null}
                {money(event.amount, event.currency) ? <span className="font-mono text-xs text-muted-foreground">{money(event.amount, event.currency)}</span> : null}
              </div>
              <h2 className="mt-2 font-heading text-xl font-semibold">{event.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{event.summary}</p>
              <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
                <span>{event.announced_at ? String(event.announced_at).slice(0, 10) : "Date unknown"}</span>
                {event.geography ? <span>{event.geography}</span> : null}
                <span>{Math.round(Number(event.confidence) * 100)}% confidence</span>
              </div>
            </Link>
          )) : <div className="border-t border-border bg-card px-6 py-20 text-center text-sm text-muted-foreground">Run the newsletter backfill to populate the defence evidence ledger.</div>}
        </div>
      </section>
    </div>
  );
}
