"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getTagChipClass } from "./knowledgebase-shared";

function NativeSelect({
  value,
  options,
  onChange,
}: {
  value?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {options.map((option) => (
        <option key={option.value || "__empty"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type FilterValues = {
  q?: string;
  source?: string;
  review?: string;
  ingestion?: string;
  tags?: string[];
  sort?: string;
};

export function KnowledgebaseFilters({
  values,
  tagOptions,
}: {
  values: FilterValues;
  tagOptions: Array<{ label: string; value: string; tagType: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(values.q ?? "");
  const debounceRef = useRef<number | null>(null);

  const selectedTags = useMemo(() => new Set(values.tags ?? []), [values.tags]);

  function navigate(next: FilterValues) {
    const params = new URLSearchParams();
    const normalizedTags = Array.from(new Set(next.tags ?? [])).filter(Boolean).sort();

    if (next.q?.trim()) params.set("q", next.q.trim());
    if (next.source) params.set("source", next.source);
    if (next.review) params.set("review", next.review);
    if (next.ingestion) params.set("ingestion", next.ingestion);
    if (next.sort) params.set("sort", next.sort);
    for (const tag of normalizedTags) params.append("tag", tag);

    const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => router.replace(target, { scroll: false }));
  }

  function patch(partial: Partial<FilterValues>) {
    navigate({
      q: values.q ?? "",
      source: values.source ?? "",
      review: values.review ?? "",
      ingestion: values.ingestion ?? "",
      tags: values.tags ?? [],
      sort: values.sort ?? "",
      ...partial,
    });
  }

  function resetFilters() {
    setQuery("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  function onSearchChange(nextValue: string) {
    setQuery(nextValue);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      patch({ q: nextValue, tags: values.tags ?? [] });
    }, 300);
  }

  function toggleTag(tag: string) {
    const next = new Set(values.tags ?? []);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    patch({ tags: Array.from(next), q: query });
  }

  const hasActive =
    Object.values({
      q: values.q,
      source: values.source,
      review: values.review,
      ingestion: values.ingestion,
      sort: values.sort,
    }).some((value) => String(value ?? "").trim() !== "") ||
    (values.tags?.length ?? 0) > 0;

  const orderedTagOptions = [...tagOptions].sort((a, b) => {
    const aSelected = selectedTags.has(a.value) ? 0 : 1;
    const bSelected = selectedTags.has(b.value) ? 0 : 1;
    return aSelected - bSelected || a.label.localeCompare(b.label);
  });

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border/60 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Search and filters</CardTitle>
            <CardDescription>
              Filter the repository by source, status, multi-tag selection, and keyword search.
            </CardDescription>
          </div>
          <div
            className={cn(
              "rounded-md border px-2 py-1 text-xs text-muted-foreground transition-opacity",
              isPending ? "border-border/80 bg-muted/30 opacity-100" : "opacity-0",
            )}
            aria-live="polite"
          >
            Updating…
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search title, summary, content, author, publisher…"
                className="pl-8"
              />
            </div>
            <NativeSelect
              value={values.source}
              onChange={(value) => patch({ source: value, q: query })}
              options={[
                { value: "", label: "All sources" },
                { value: "article", label: "Article" },
                { value: "pdf", label: "PDF" },
                { value: "youtube_video", label: "YouTube" },
                { value: "x_post", label: "X post" },
                { value: "document", label: "Document" },
                { value: "unknown", label: "Unknown" },
              ]}
            />
            <NativeSelect
              value={values.review}
              onChange={(value) => patch({ review: value, q: query })}
              options={[
                { value: "", label: "All review states" },
                { value: "inbox", label: "Inbox" },
                { value: "reviewed", label: "Reviewed" },
                { value: "archived", label: "Archived" },
                { value: "failed", label: "Failed" },
              ]}
            />
            <NativeSelect
              value={values.ingestion}
              onChange={(value) => patch({ ingestion: value, q: query })}
              options={[
                { value: "", label: "All ingestion states" },
                { value: "pending", label: "Pending" },
                { value: "ready", label: "Ready" },
                { value: "partial", label: "Partial" },
                { value: "failed", label: "Failed" },
              ]}
            />
            <NativeSelect
              value={values.sort}
              onChange={(value) => patch({ sort: value, q: query })}
              options={[
                { value: "", label: "Newest captured" },
                { value: "published_desc", label: "Newest published" },
                { value: "captured_asc", label: "Oldest captured" },
                { value: "title_asc", label: "Title A–Z" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Tags</p>
              {(values.tags?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => patch({ tags: [], q: query })}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear all tags
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {orderedTagOptions.map((tag) => {
                const selected = selectedTags.has(tag.value);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => toggleTag(tag.value)}
                    className={cn(getTagChipClass(tag.tagType, selected), "cursor-pointer")}
                    aria-pressed={selected}
                  >
                    #{tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasActive ? (
              <Button type="button" variant="ghost" onClick={resetFilters}>
                <X className="size-4" />
                Reset
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
