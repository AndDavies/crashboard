import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { KnowledgebaseDocumentListItem } from "@/lib/knowledgebase/data";
import {
  formatDate,
  IngestionStatusBadge,
  ReviewStatusBadge,
  SourceBadge,
  TagChips,
  TitleFallback,
} from "./knowledgebase-shared";

function qualityFlagCount(flags: Record<string, unknown>) {
  return Object.keys(flags).length;
}

export function KnowledgebaseList({ items }: { items: KnowledgebaseDocumentListItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">No documents found</CardTitle>
          <CardDescription>
            There are no repository items matching the current filters yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const title = TitleFallback({ title: item.title, originalUrl: item.originalUrl });
        const qualityCount = qualityFlagCount(item.qualityFlags);
        return (
          <Card key={item.id} className="shadow-none transition-shadow hover:shadow-sm">
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge source={item.sourceType} />
                      <ReviewStatusBadge status={item.reviewStatus} />
                      {item.ingestionStatus !== "ready" ? (
                        <IngestionStatusBadge status={item.ingestionStatus} />
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Link
                        href={`/dashboard/knowledgebase/${item.id}`}
                        className="font-heading text-lg font-semibold tracking-tight text-foreground hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {[item.publisherName, item.authorName, item.urlHost]
                          .filter(Boolean)
                          .join(" · ") || "Saved repository entry"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground lg:justify-end">
                    {formatDate(item.publishedAt) ? <span>Published {formatDate(item.publishedAt)}</span> : null}
                    {formatDate(item.capturedAt) ? <span>Captured {formatDate(item.capturedAt)}</span> : null}
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.summaryShort?.trim() || "No summary yet. Open the document to inspect the extracted content and metadata."}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <TagChips tags={item.tags} />
                  <div className="flex flex-wrap items-center gap-2">
                    {qualityCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                        <AlertTriangle className="size-3" />
                        {qualityCount} quality flag{qualityCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <Link
                      href={item.canonicalUrl ?? item.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
                    >
                      Original source
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
