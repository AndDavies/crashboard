import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  KnowledgebaseIngestionStatus,
  KnowledgebaseReviewStatus,
  KnowledgebaseSourceType,
  KnowledgebaseTag,
} from "@/lib/knowledgebase/data";

export function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const sourceLabels: Record<KnowledgebaseSourceType, string> = {
  article: "Article",
  pdf: "PDF",
  youtube_video: "YouTube",
  x_post: "X post",
  document: "Document",
  unknown: "Unknown",
};

const reviewVariant: Record<KnowledgebaseReviewStatus, "secondary" | "default" | "outline" | "destructive"> = {
  inbox: "secondary",
  reviewed: "default",
  archived: "outline",
  failed: "destructive",
};

const ingestionVariant: Record<KnowledgebaseIngestionStatus, "secondary" | "default" | "outline" | "destructive"> = {
  pending: "secondary",
  ready: "default",
  partial: "outline",
  failed: "destructive",
};

const tagTypeClasses: Record<string, string> = {
  user_hashtag: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
  leroy_keyword: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-300",
  topic: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
  project: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
  entity_hint: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300",
};

export function SourceBadge({ source }: { source: KnowledgebaseSourceType }) {
  return (
    <Badge variant="outline" className="font-normal">
      {sourceLabels[source]}
    </Badge>
  );
}

export function ReviewStatusBadge({ status }: { status: KnowledgebaseReviewStatus }) {
  return (
    <Badge variant={reviewVariant[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export function IngestionStatusBadge({ status }: { status: KnowledgebaseIngestionStatus }) {
  return (
    <Badge variant={ingestionVariant[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export function getTagChipClass(tagType: string, selected = false) {
  return cn(
    "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
    selected ? "ring-2 ring-ring/30" : "",
    tagTypeClasses[tagType] ?? "border-border/80 bg-muted/30 text-muted-foreground",
  );
}

export function TagChips({ tags, limit = 6 }: { tags: KnowledgebaseTag[]; limit?: number }) {
  if (tags.length === 0) return null;
  const visible = tags.slice(0, limit);
  const remaining = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <span key={`${tag.id}-${tag.source}`} className={getTagChipClass(tag.tagType)}>
          #{tag.tag}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="rounded-md border border-border/80 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">
          +{remaining} more
        </span>
      ) : null}
    </div>
  );
}

export function TitleFallback({ title, originalUrl }: { title: string | null; originalUrl: string }) {
  if (title?.trim()) return title;
  try {
    const url = new URL(originalUrl);
    return url.hostname + url.pathname;
  } catch {
    return originalUrl;
  }
}
