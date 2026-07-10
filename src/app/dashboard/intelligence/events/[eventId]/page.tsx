import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EVENT_TYPE_LABELS } from "@/lib/intelligence/taxonomy";
import { getIntelligenceEvent } from "@/lib/intelligence/data";
import type { IntelligenceEventType } from "@/lib/intelligence/types";

export const metadata: Metadata = { title: "Evidence Event · Trend Intelligence" };
export const dynamic = "force-dynamic";

export default async function IntelligenceEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const result = await getIntelligenceEvent(eventId);
  if (!result) notFound();
  const event = result.event as Record<string, unknown>;

  return (
    <article className="space-y-8 pb-14">
      <header className="border-b border-foreground/80 pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{EVENT_TYPE_LABELS[event.event_type as IntelligenceEventType]}</Badge>
          <Badge variant="outline">{String(event.lifecycle_status).replaceAll("_", " ")}</Badge>
          {event.defence_relevance ? <Badge variant="secondary">Defence</Badge> : null}
          {event.canada_allied_relevance ? <Badge variant="secondary">Canada / allied</Badge> : null}
        </div>
        <h1 className="mt-5 max-w-5xl font-heading text-4xl font-semibold leading-tight">{String(event.title)}</h1>
        <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">{String(event.summary ?? "")}</p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
          <span>Confidence {Math.round(Number(event.confidence) * 100)}%</span>
          <span>Evidence quality {Math.round(Number(event.evidence_quality) * 100)}%</span>
          {event.announced_at ? <span>Announced {String(event.announced_at).slice(0, 10)}</span> : null}
          {event.closes_at ? <span>Closes {String(event.closes_at).slice(0, 10)}</span> : null}
          {event.geography ? <span>{String(event.geography)}</span> : null}
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.45fr_0.8fr]">
        <div>
          <div className="border-b border-foreground/80 pb-3"><p className="editorial-kicker">Evidence chain</p><h2 className="mt-1 font-heading text-2xl font-semibold">Supporting sources</h2></div>
          <div className="border-x border-b border-border">
            {result.evidence.map((row, index) => {
              const evidence = row as unknown as { evidence_role: string; evidence_text: string | null; documents: Record<string, unknown> | null };
              const document = evidence.documents ?? {};
              const url = String(document.canonical_url ?? document.original_url ?? "#");
              return (
                <a key={`${evidence.evidence_role}-${index}`} href={url} target="_blank" rel="noopener noreferrer" className="block border-t border-border bg-card px-4 py-4 hover:bg-muted/50">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{evidence.evidence_role.replaceAll("_", " ")}</Badge>{document.publisher_name ? <span className="text-xs text-muted-foreground">{String(document.publisher_name)}</span> : null}</div>
                  <h3 className="mt-2 font-heading text-lg font-semibold">{String(document.title ?? "Untitled source")}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{evidence.evidence_text ?? String(document.summary_short ?? "")}</p>
                  {document.published_at ? <p className="mt-2 font-mono text-xs text-muted-foreground">{String(document.published_at).slice(0, 10)}</p> : null}
                </a>
              );
            })}
          </div>
        </div>
        <aside className="border border-border bg-card p-4">
          <p className="editorial-kicker">Entity register</p>
          <div className="mt-4 space-y-4">
            {result.entities.map((row, index) => {
              const relation = row as unknown as { role: string; intelligence_entities: Record<string, unknown> | null };
              const entity = relation.intelligence_entities ?? {};
              return (
                <div key={`${relation.role}-${index}`} className="border-t border-border pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{String(entity.canonical_name ?? "Unknown entity")}</span><Badge variant="outline">{String(entity.entity_type ?? "entity").replaceAll("_", " ")}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{relation.role}</p>
                </div>
              );
            })}
            {!result.entities.length ? <p className="text-sm text-muted-foreground">No resolved entities.</p> : null}
          </div>
        </aside>
      </section>
    </article>
  );
}
