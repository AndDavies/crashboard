import Link from "next/link";
import { ExternalLink, Info, Link2, MessageSquareText, Tags } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { KnowledgebaseDocumentDetail } from "@/lib/knowledgebase/data";
import {
  getKnowledgebaseAlternateSourceLink,
  getKnowledgebasePreferredSourceLink,
} from "@/lib/knowledgebase/source-links";
import {
  formatDate,
  IngestionStatusBadge,
  ReviewStatusBadge,
  SourceBadge,
  TagChips,
  TitleFallback,
} from "./knowledgebase-shared";
import { ReviewStatusForm } from "./review-status-form";

function renderStructuredParagraphs(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

function ContentBlock({
  title,
  text,
  prose = false,
}: {
  title: string;
  text: string | null;
  prose?: boolean;
}) {
  if (!text?.trim()) return null;
  const blocks = renderStructuredParagraphs(text);
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div
          className={prose ? "prose prose-sm dark:prose-invert max-w-none text-foreground" : "space-y-4 text-sm leading-relaxed text-muted-foreground"}
        >
          {blocks.map((block, index) => (
            <p key={`${title}-${index}`} className={prose ? undefined : "whitespace-pre-wrap"}>
              {block}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function KnowledgebaseDocumentDetailView({ document }: { document: KnowledgebaseDocumentDetail }) {
  const title = TitleFallback({ title: document.title, originalUrl: document.originalUrl });
  const primarySourceLink = getKnowledgebasePreferredSourceLink({
    originalUrl: document.originalUrl,
    canonicalUrl: document.canonicalUrl,
    metadata: document.metadata,
  });
  const alternateSourceLink = getKnowledgebaseAlternateSourceLink({
    originalUrl: document.originalUrl,
    canonicalUrl: document.canonicalUrl,
    metadata: document.metadata,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_22rem]">
      <div className="space-y-6">
        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={document.sourceType} />
              <ReviewStatusBadge status={document.reviewStatus} />
              <IngestionStatusBadge status={document.ingestionStatus} />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {[document.publisherName, document.authorName, document.urlHost]
                  .filter(Boolean)
                  .join(" · ") || "Saved repository document"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {formatDate(document.publishedAt) ? <span>Published {formatDate(document.publishedAt)}</span> : null}
              {formatDate(document.capturedAt) ? <span>Captured {formatDate(document.capturedAt)}</span> : null}
              {document.language ? <span>Language: {document.language}</span> : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-4">
            <Link
              href={primarySourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/30"
            >
              {primarySourceLink.label}
              <ExternalLink className="size-4" />
            </Link>
            {alternateSourceLink ? (
              <Link
                href={alternateSourceLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/30"
              >
                {alternateSourceLink.label}
                <ExternalLink className="size-4" />
              </Link>
            ) : null}
          </CardContent>
        </Card>

        {document.summaryShort ? (
          <Card className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm leading-relaxed text-muted-foreground">
              {document.summaryShort}
            </CardContent>
          </Card>
        ) : null}

        <ContentBlock title="Readable content" text={document.contentMarkdown ?? document.contentText} prose />
        {document.contentMarkdown && document.contentText && document.contentMarkdown !== document.contentText ? (
          <ContentBlock title="Normalized text" text={document.contentText} />
        ) : null}
        <ContentBlock title="Transcript" text={document.transcriptText} />

        {document.links.length > 0 ? (
          <Card className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="size-4 text-muted-foreground" />
                Related links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {document.links.map((link) => (
                <div key={link.id} className="rounded-lg border border-border/70 bg-background px-4 py-3 text-sm">
                  <p className="font-medium text-foreground">{link.relation.replace(/_/g, " ")}</p>
                  {link.url ? (
                    <Link href={link.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-muted-foreground hover:underline">
                      {link.url}
                    </Link>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-base">Review</CardTitle>
            <CardDescription>Update the repository review state for this document.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ReviewStatusForm documentId={document.id} reviewStatus={document.reviewStatus} />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-muted-foreground" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide">Source type</p>
              <p>{document.sourceType}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide">Extraction</p>
              <p>{document.extractionMethod ?? "Unknown"}{document.extractionVersion ? ` · ${document.extractionVersion}` : ""}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide">Host</p>
              <p>{document.urlHost ?? "—"}</p>
            </div>
            {typeof document.metadata.drive_file_id === "string" ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide">Drive file ID</p>
                <p className="break-all font-mono text-[11px] text-foreground">{document.metadata.drive_file_id}</p>
              </div>
            ) : null}
            {typeof document.metadata.sheet_import_source === "string" ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide">Import source</p>
                <p>{document.metadata.sheet_import_source}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide">Document ID</p>
              <p className="break-all font-mono text-[11px] text-foreground">{document.id}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="size-4 text-muted-foreground" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <TagChips tags={document.tags} limit={12} />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4 text-muted-foreground" />
              Capture history
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {document.captures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No capture history recorded.</p>
            ) : (
              document.captures.map((capture) => (
                <div key={capture.id} className="rounded-lg border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{capture.captureSource}</p>
                  <p className="mt-1 text-xs">{formatDate(capture.capturedAt) ?? capture.capturedAt}</p>
                  {capture.senderLabel ? <p className="mt-1">Sender: {capture.senderLabel}</p> : null}
                  {capture.rawText ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{capture.rawText}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
