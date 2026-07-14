import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  actionLabel,
  contentTypeLabel,
  entityRoleLabel,
  entityTypeLabel,
  isTrendEligibleContent,
  sourceTypeLabel,
  trendItemCountLabel,
} from "@/components/dashboard/intelligence/deep-link-language";
import { Badge } from "@/components/ui/badge";
import { conceptSignalKey, entitySignalKey } from "@/lib/intelligence/signal-keys";
import { getIntelligenceDocument } from "@/lib/intelligence/signal-data";
import { getTursoIntelligenceStore, intelligenceUsesTurso } from "@/lib/intelligence/store";

export const metadata: Metadata = { title: "Source · Intelligence" };
export const dynamic = "force-dynamic";

function exploreSignalHref(key: string, label: unknown) {
  const query = new URLSearchParams({ signal: key, q: String(label ?? "") });
  return `/dashboard/intelligence/explore?${query}`;
}

export default async function IntelligenceDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  if (intelligenceUsesTurso()) {
    const document = await getTursoIntelligenceStore().getDocument(documentId);
    if (!document) notFound();
    return (
      <article className="space-y-8 pb-14">
        <header className="border-b border-foreground/80 pb-7">
          <Badge>{sourceTypeLabel(document.sourceType)}</Badge>
          <h1 className="mt-5 max-w-5xl font-heading text-4xl font-semibold leading-tight">
            {document.title || "Untitled source"}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-5 font-mono text-xs text-muted-foreground">
            <span>{document.publisher ?? document.sourceFamily}</span>
            {document.publishedAt ? <span>{document.publishedAt.slice(0, 10)}</span> : null}
            <span>{document.editorialTokens.toLocaleString()} editorial words and terms</span>
            {document.canonicalUrl ? (
              <a href={document.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-sans font-medium text-foreground hover:text-accent">
                Open original <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        </header>
        <section>
          <div className="border-b border-foreground/80 pb-3">
            <p className="editorial-kicker">Retained evidence</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">Source text</h2>
          </div>
          <div className="whitespace-pre-wrap border border-t-0 border-border bg-card p-5 text-sm leading-7 text-muted-foreground">
            {document.contentText}
          </div>
        </section>
      </article>
    );
  }
  const data = await getIntelligenceDocument(documentId);
  if (!data) notFound();

  const document = data.document as Record<string, unknown>;
  const sourceUrl = String(document.canonical_url ?? document.original_url ?? "#");
  const analyzedItems = data.segments.filter((item) =>
    isTrendEligibleContent(item.segment_type),
  ).length;

  return (
    <article className="space-y-8 pb-14">
      <header className="border-b border-foreground/80 pb-7">
        <Badge>{sourceTypeLabel(document.source_type)}</Badge>
        <h1 className="mt-5 max-w-5xl font-heading text-4xl font-semibold leading-tight">
          {String(document.title ?? "Untitled source")}
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
          {String(document.summary_short ?? "")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-5 font-mono text-xs text-muted-foreground">
          {document.publisher_name ? <span>{String(document.publisher_name)}</span> : null}
          {document.published_at ? <span>{String(document.published_at).slice(0, 10)}</span> : null}
          <span>{trendItemCountLabel(analyzedItems)}</span>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-sans font-medium text-foreground hover:text-accent"
          >
            Open original <ExternalLink className="size-3" />
          </a>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.5fr_0.8fr]">
        <div>
          <div className="border-b border-foreground/80 pb-3">
            <p className="editorial-kicker">Inside this source</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">Articles and source text</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Articles and full newsletters count toward trends. Navigation, footers, and sponsored
              content do not.
            </p>
          </div>
          <div className="border-x border-b border-border">
            {data.segments.map((segment, index) => {
              const countsTowardTrends = isTrendEligibleContent(segment.segment_type);
              return (
                <section key={String(segment.id)} className="border-t border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{contentTypeLabel(segment.segment_type)}</Badge>
                    {!countsTowardTrends ? <Badge variant="secondary">Not counted</Badge> : null}
                    <span className="font-mono text-xs text-muted-foreground">Item {index + 1}</span>
                    {segment.outbound_url ? (
                      <a
                        href={String(segment.outbound_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium"
                      >
                        Open article <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>
                  {segment.title ? (
                    <h3 className="mt-3 font-heading text-xl font-semibold">{String(segment.title)}</h3>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                    {String(segment.content_text)}
                  </p>
                </section>
              );
            })}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="border border-border bg-card p-4">
            <p className="editorial-kicker">Topics</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.concepts.map((row, index) => {
                const item = row as unknown as {
                  intelligence_concepts: Record<string, unknown> | null;
                };
                const concept = item.intelligence_concepts ?? {};
                const signalKey = conceptSignalKey(concept.id, concept.concept_type);
                return (
                  <Link
                    key={`${concept.id}-${index}`}
                    href={exploreSignalHref(signalKey!, concept.canonical_label)}
                  >
                    <Badge variant="secondary">{String(concept.canonical_label)}</Badge>
                  </Link>
                );
              })}
              {!data.concepts.length ? (
                <p className="text-sm text-muted-foreground">No topics were identified.</p>
              ) : null}
            </div>
          </div>

          <div className="border border-border bg-card p-4">
            <p className="editorial-kicker">Organizations, systems, and programmes</p>
            <div className="mt-4 space-y-3">
              {data.entities.map((row, index) => {
                const item = row as unknown as {
                  role: string;
                  intelligence_entities: Record<string, unknown> | null;
                };
                const entity = item.intelligence_entities ?? {};
                const signalKey = entitySignalKey(entity.id, entity.entity_type);
                return (
                  <div
                    key={`${entity.id}-${index}`}
                    className="border-b border-border pb-2 last:border-0"
                  >
                    {signalKey ? (
                      <Link
                        href={exploreSignalHref(signalKey, entity.canonical_name)}
                        className="font-medium hover:text-accent"
                      >
                        {String(entity.canonical_name)}
                      </Link>
                    ) : (
                      <span className="font-medium">{String(entity.canonical_name)}</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {entityRoleLabel(item.role)} · {entityTypeLabel(entity.entity_type)}
                    </p>
                  </div>
                );
              })}
              {!data.entities.length ? (
                <p className="text-sm text-muted-foreground">
                  No organizations, systems, or programmes were identified.
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

      {data.evidence.length ? (
        <section>
          <div className="border-b border-foreground/80 pb-3">
            <p className="editorial-kicker">Important actions</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">
              Announcements supported by this source
            </h2>
          </div>
          <div className="border-x border-b border-border">
            {data.evidence.map((row, index) => {
              const item = row as unknown as {
                evidence_text: string | null;
                intelligence_events: Record<string, unknown> | null;
              };
              const event = item.intelligence_events ?? {};
              return (
                <Link
                  key={`${event.id}-${index}`}
                  href={`/dashboard/intelligence/events/${event.id}`}
                  className="block border-t border-border bg-card p-4 hover:bg-muted/50"
                >
                  <Badge variant="outline">{actionLabel(event.event_type)}</Badge>
                  <h3 className="mt-2 font-medium">{String(event.title)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.evidence_text}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </article>
  );
}
