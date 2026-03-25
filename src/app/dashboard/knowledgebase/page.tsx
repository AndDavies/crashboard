import type { Metadata } from "next";
import { KnowledgebaseFilters } from "@/components/dashboard/knowledgebase/knowledgebase-filters";
import { KnowledgebaseList } from "@/components/dashboard/knowledgebase/knowledgebase-list";
import { KnowledgebaseSummaryCards } from "@/components/dashboard/knowledgebase/knowledgebase-summary-cards";
import {
  getKnowledgebaseFilterOptions,
  getKnowledgebaseList,
  getKnowledgebaseSummaryStats,
} from "@/lib/knowledgebase/data";

export const metadata: Metadata = {
  title: "Knowledgebase",
  description: "Private repository of saved documents, captures, tags, and extracted content.",
};

export default async function KnowledgebasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tagParam = params.tag;
  const tags = Array.isArray(tagParam)
    ? tagParam.filter((value): value is string => typeof value === "string")
    : typeof tagParam === "string"
      ? [tagParam]
      : [];

  const values = {
    q: typeof params.q === "string" ? params.q : "",
    source: typeof params.source === "string" ? params.source : "",
    review: typeof params.review === "string" ? params.review : "",
    ingestion: typeof params.ingestion === "string" ? params.ingestion : "",
    tags,
    sort: typeof params.sort === "string" ? params.sort : "",
    page: typeof params.page === "string" ? Number(params.page) : 1,
  };

  const [stats, tagOptions, result] = await Promise.all([
    getKnowledgebaseSummaryStats(),
    getKnowledgebaseFilterOptions(),
    getKnowledgebaseList(values),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const rangeEnd = Math.min(result.total, result.page * result.pageSize);
  const buildPageHref = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (key === "page") continue;
      if (key === "tags") {
        for (const tag of value as string[]) {
          if (tag) search.append("tag", tag);
        }
        continue;
      }
      if (!value) continue;
      search.set(key, String(value));
    }
    if (page > 1) search.set("page", String(page));
    const q = search.toString();
    return q ? `/dashboard/knowledgebase?${q}` : "/dashboard/knowledgebase";
  };

  return (
    <div className="space-y-8">
      <section className="space-y-2 border-b border-border/80 pb-6">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Knowledgebase
        </p>
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          Repository
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Private repository of saved documents from Telegram, OpenClaw, and Leroy. Browse captured entries, inspect extracted content, and move items through a lightweight review workflow.
        </p>
      </section>

      <KnowledgebaseSummaryCards stats={stats} />
      <KnowledgebaseFilters
        key={JSON.stringify({
          q: values.q,
          source: values.source,
          review: values.review,
          ingestion: values.ingestion,
          tags: values.tags,
          sort: values.sort,
        })}
        values={values}
        tagOptions={tagOptions}
      />

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing <span className="font-medium text-foreground">{rangeStart}</span>–<span className="font-medium text-foreground">{rangeEnd}</span> of <span className="font-medium text-foreground">{result.total}</span> documents
        </p>
        <p>
          {(values.tags.length > 0 ? `${values.tags.length} tag${values.tags.length === 1 ? "" : "s"} selected · ` : "")}
          Sorted by {values.sort === "published_desc" ? "newest published" : values.sort === "captured_asc" ? "oldest captured" : values.sort === "title_asc" ? "title A–Z" : "newest captured"}
        </p>
      </div>

      <KnowledgebaseList items={result.items} />

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Page {result.page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {result.page > 1 ? (
              <a href={buildPageHref(result.page - 1)} className="rounded-md border border-border/80 px-3 py-1.5 hover:bg-muted/40">
                Previous
              </a>
            ) : null}
            {result.page < totalPages ? (
              <a href={buildPageHref(result.page + 1)} className="rounded-md border border-border/80 px-3 py-1.5 hover:bg-muted/40">
                Next
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
