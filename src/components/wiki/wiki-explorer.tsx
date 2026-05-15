"use client";

import Link from "next/link";
import Image from "next/image";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { cn } from "@/lib/utils";
import type { PublicWikiIndex, PublicWikiIndexPage } from "@/lib/public-wiki/types";

function label(input: string) {
  return input
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function matches(page: PublicWikiIndexPage, query: string) {
  if (!query) return true;
  const haystack = [
    page.title,
    page.description,
    page.cluster,
    page.role,
    page.plainText,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function WikiExplorer({ index }: { index: PublicWikiIndex }) {
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("cluster");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const pages = useMemo(() => {
    const filtered = index.pages.filter((page) => {
      if (cluster !== "all" && page.cluster !== cluster) return false;
      if (role !== "all" && page.role !== role) return false;
      return matches(page, deferredQuery);
    });
    return filtered.toSorted((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "sources") return b.sourceNotes.length - a.sourceNotes.length;
      if (sort === "reading") return b.readingMinutes - a.readingMinutes;
      return `${a.cluster}-${a.title}`.localeCompare(`${b.cluster}-${b.title}`);
    });
  }, [cluster, deferredQuery, index.pages, role, sort]);

  const visibleIds = new Set(pages.map((page) => page.slug));
  const pageBySlug = useMemo(() => {
    return new Map(index.pages.map((page) => [page.slug, page]));
  }, [index.pages]);
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const page of index.pages) map.set(page.slug, new Set());
    for (const edge of index.graph.edges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    return map;
  }, [index.graph.edges, index.pages]);
  const graph = {
    nodes: index.graph.nodes.filter((node) => visibleIds.has(node.id)),
    edges: index.graph.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    ),
  };
  const focusedNodeId = selectedNodeId ?? activeNodeId;
  const focusedNeighbors = focusedNodeId ? (neighborMap.get(focusedNodeId) ?? new Set<string>()) : new Set<string>();

  function setClusterFilter(nextCluster: string) {
    setCluster(nextCluster);
    setActiveNodeId(null);
    setSelectedNodeId(null);
  }

  function setRoleFilter(nextRole: string) {
    setRole(nextRole);
    setActiveNodeId(null);
    setSelectedNodeId(null);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border/80 bg-card/70 p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <SearchIcon className="size-3.5" aria-hidden />
              Search the wiki
            </span>
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveNodeId(null);
                setSelectedNodeId(null);
              }}
              placeholder="Search concepts, workflows, source notes..."
              className="h-10 bg-background/80"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Cluster
            </span>
            <select
              value={cluster}
              onChange={(event) => setClusterFilter(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All clusters</option>
              {index.clusters.map((item) => (
                <option key={item.id} value={item.id}>
                  {label(item.label)} ({item.count})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Role
            </span>
            <select
              value={role}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All roles</option>
              {index.roles.map((item) => (
                <option key={item.id} value={item.id}>
                  {label(item.label)} ({item.count})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <SlidersHorizontalIcon className="size-3.5" aria-hidden />
              Sort
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="cluster">Cluster</option>
              <option value="title">Title</option>
              <option value="sources">Source notes</option>
              <option value="reading">Reading time</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{pages.length} pages</Badge>
          <Badge variant="outline">{graph.edges.length} visible links</Badge>
          <Badge variant="outline">{index.generatedAt.slice(0, 10)} export</Badge>
          {focusedNodeId ? (
            <Badge variant="secondary">
              {focusedNeighbors.size} focused relationships
            </Badge>
          ) : null}
          {(query || cluster !== "all" || role !== "all") ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setClusterFilter("all");
                setRoleFilter("all");
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Browse by cluster
            </p>
            <div className="flex flex-wrap gap-1.5">
              {index.clusters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setClusterFilter(cluster === item.id ? "all" : item.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    cluster === item.id
                      ? "border-primary/40 bg-primary text-primary-foreground"
                      : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {label(item.label)} · {item.count}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Browse by role
            </p>
            <div className="flex flex-wrap gap-1.5">
              {index.roles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRoleFilter(role === item.id ? "all" : item.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    role === item.id
                      ? "border-primary/40 bg-primary text-primary-foreground"
                      : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {label(item.label)} · {item.count}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <WikiGraph
        nodes={graph.nodes}
        edges={graph.edges}
        compact
        activeNodeId={activeNodeId}
        selectedNodeId={selectedNodeId}
        onNodeHover={setActiveNodeId}
        onNodeSelect={setSelectedNodeId}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pages.map((page) => (
          <Link
            key={page.slug}
            href={`/wiki/${page.slug}`}
            onMouseEnter={() => setActiveNodeId(page.slug)}
            onMouseLeave={() => setActiveNodeId(null)}
            onFocus={() => setActiveNodeId(page.slug)}
            onBlur={() => setActiveNodeId(null)}
            className={cn(
              "group relative flex min-h-72 flex-col overflow-hidden rounded-lg border bg-card/75 shadow-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              focusedNodeId === page.slug
                ? "border-primary/45 shadow-md ring-1 ring-primary/20"
                : focusedNeighbors.has(page.slug)
                  ? "border-primary/25 shadow-sm"
                  : "border-border/80 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
              focusedNodeId && focusedNodeId !== page.slug && !focusedNeighbors.has(page.slug) && "opacity-70",
            )}
          >
            <div className="relative h-28 overflow-hidden border-b border-border/70 bg-muted">
              <Image
                src={page.heroImage}
                alt=""
                width={1200}
                height={630}
                unoptimized
                className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{label(page.cluster)}</Badge>
                <Badge variant="outline">{label(page.role)}</Badge>
              </div>
              <h2 className="font-heading text-lg font-semibold leading-tight text-foreground">
                {page.title}
              </h2>
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {page.description}
              </p>
              {(() => {
                const related = Array.from(neighborMap.get(page.slug) ?? [])
                  .map((slug) => pageBySlug.get(slug))
                  .filter((item): item is PublicWikiIndexPage => Boolean(item))
                  .slice(0, 3);
                return related.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Connected to
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {related.map((item) => (
                        <span
                          key={item.slug}
                          className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground transition-colors group-hover:text-foreground"
                        >
                          {item.title}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="mt-auto flex items-center justify-between pt-5 text-xs font-medium text-muted-foreground">
                <span>{page.readingMinutes} min read</span>
                <span>
                  {page.sourceNotes.length} sources · {neighborMap.get(page.slug)?.size ?? 0} links
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-border/80 bg-card/70 p-8 text-center">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            No pages match those filters.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Clear the filters or search a broader term.
          </p>
        </div>
      ) : null}
    </div>
  );
}
