"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  ListIcon,
  MapIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import {
  useDeferredValue,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { cn } from "@/lib/utils";
import type { PublicWikiIndex, PublicWikiIndexPage } from "@/lib/public-wiki/types";

type ExplorerMode = "atlas" | "index" | "garden";
type SortOption = "cluster" | "title" | "sources" | "reading" | "links";

type RelationMaps = {
  backlinks: Map<string, string[]>;
  outbound: Map<string, string[]>;
  neighbors: Map<string, Set<string>>;
  degree: Map<string, number>;
};

type ReadingTrail = {
  id: string;
  title: string;
  description: string;
  clusterId: string;
  pages: PublicWikiIndexPage[];
  sourceCount: number;
  linkCount: number;
};

const modeOptions: Array<{
  id: ExplorerMode;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  { id: "atlas", label: "Atlas", icon: MapIcon },
  { id: "index", label: "Index", icon: ListIcon },
  { id: "garden", label: "Garden", icon: LayoutGridIcon },
];

function label(input: string) {
  return input
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function unique(items: string[]) {
  return Array.from(new Set(items));
}

function roleWeight(role: string) {
  if (role === "hub") return 36;
  if (role === "concept") return 22;
  return 10;
}

function relationCount(slug: string, relationMaps: RelationMaps) {
  return relationMaps.degree.get(slug) ?? 0;
}

function pageScore(page: PublicWikiIndexPage, relationMaps: RelationMaps) {
  return (
    roleWeight(page.role) +
    relationCount(page.slug, relationMaps) * 3 +
    page.sourceNotes.length * 1.5 +
    Math.min(page.readingMinutes, 12)
  );
}

function matches(page: PublicWikiIndexPage, query: string) {
  if (!query) return true;
  const haystack = [
    page.title,
    page.description,
    page.cluster,
    page.role,
    page.headings.map((heading) => heading.text).join(" "),
    page.sourceNotes.join(" "),
    page.linkedSlugs.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function pagesFromSlugs(
  slugs: string[],
  pageBySlug: Map<string, PublicWikiIndexPage>,
) {
  return slugs
    .map((slug) => pageBySlug.get(slug))
    .filter((page): page is PublicWikiIndexPage => Boolean(page));
}

function makeRelationMaps(index: PublicWikiIndex): RelationMaps {
  const backlinks = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();
  const neighbors = new Map<string, Set<string>>();

  for (const page of index.pages) {
    backlinks.set(page.slug, []);
    outbound.set(page.slug, []);
    neighbors.set(page.slug, new Set());
  }

  for (const edge of index.graph.edges) {
    outbound.set(edge.source, [...(outbound.get(edge.source) ?? []), edge.target]);
    backlinks.set(edge.target, [...(backlinks.get(edge.target) ?? []), edge.source]);
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const degree = new Map<string, number>();
  for (const [slug, related] of neighbors) {
    degree.set(slug, related.size);
  }

  return { backlinks, outbound, neighbors, degree };
}

export function WikiExplorer({ index }: { index: PublicWikiIndex }) {
  const [mode, setMode] = useState<ExplorerMode>("atlas");
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState<SortOption>("cluster");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const pageBySlug = useMemo(() => {
    return new Map(index.pages.map((page) => [page.slug, page]));
  }, [index.pages]);

  const relationMaps = useMemo(() => makeRelationMaps(index), [index]);

  const entryPages = useMemo(() => {
    return index.pages
      .toSorted((a, b) => pageScore(b, relationMaps) - pageScore(a, relationMaps))
      .slice(0, 6);
  }, [index.pages, relationMaps]);

  const readingTrails = useMemo<ReadingTrail[]>(() => {
    return index.clusters
      .map((item) => {
        const trailPages = index.pages
          .filter((page) => page.cluster === item.id)
          .toSorted((a, b) => pageScore(b, relationMaps) - pageScore(a, relationMaps))
          .slice(0, 4);
        const sourceCount = trailPages.reduce(
          (sum, page) => sum + page.sourceNotes.length,
          0,
        );
        const linkCount = trailPages.reduce(
          (sum, page) => sum + relationCount(page.slug, relationMaps),
          0,
        );
        return {
          id: item.id,
          title: `${label(item.label)} trail`,
          description: `A route through ${trailPages.length} ${label(item.label).toLowerCase()} pages with ${sourceCount} source notes and ${linkCount} relationships.`,
          clusterId: item.id,
          pages: trailPages,
          sourceCount,
          linkCount,
        };
      })
      .filter((trail) => trail.pages.length > 1)
      .toSorted((a, b) => b.linkCount + b.sourceCount - (a.linkCount + a.sourceCount))
      .slice(0, 5);
  }, [index.clusters, index.pages, relationMaps]);

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
      if (sort === "links") {
        return relationCount(b.slug, relationMaps) - relationCount(a.slug, relationMaps);
      }
      return `${a.cluster}-${a.title}`.localeCompare(`${b.cluster}-${b.title}`);
    });
  }, [cluster, deferredQuery, index.pages, relationMaps, role, sort]);

  const visibleIds = useMemo(() => new Set(pages.map((page) => page.slug)), [pages]);

  const graph = useMemo(() => {
    return {
      nodes: index.graph.nodes.filter((node) => visibleIds.has(node.id)),
      edges: index.graph.edges.filter(
        (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
      ),
    };
  }, [index.graph.edges, index.graph.nodes, visibleIds]);

  const selectedPage = selectedNodeId ? pageBySlug.get(selectedNodeId) ?? null : null;
  const focusedNodeId = selectedNodeId ?? activeNodeId;
  const focusedNeighbors = focusedNodeId
    ? (relationMaps.neighbors.get(focusedNodeId) ?? new Set<string>())
    : new Set<string>();

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

  function resetFilters() {
    setQuery("");
    setClusterFilter("all");
    setRoleFilter("all");
    setSort("cluster");
  }

  function selectPage(slug: string | null) {
    setSelectedNodeId(slug);
    setActiveNodeId(slug);
  }

  function followTrail(trail: ReadingTrail) {
    setMode("garden");
    setClusterFilter(trail.clusterId);
    selectPage(trail.pages[0]?.slug ?? null);
  }

  return (
    <div className="space-y-8">
      <ExplorerControls
        activeNodeId={focusedNodeId}
        cluster={cluster}
        graphEdgeCount={graph.edges.length}
        index={index}
        mode={mode}
        pageCount={pages.length}
        query={query}
        role={role}
        setClusterFilter={setClusterFilter}
        setMode={setMode}
        setQuery={setQuery}
        setRoleFilter={setRoleFilter}
        setSort={setSort}
        sort={sort}
        resetFilters={resetFilters}
        relationCount={
          focusedNodeId ? relationCount(focusedNodeId, relationMaps) : null
        }
      />

      {mode === "atlas" ? (
        <AtlasMode
          entryPages={entryPages}
          graph={graph}
          index={index}
          readingTrails={readingTrails}
          relationMaps={relationMaps}
          pageBySlug={pageBySlug}
          activeNodeId={activeNodeId}
          selectedNodeId={selectedNodeId}
          selectedPage={selectedPage}
          onHover={setActiveNodeId}
          onSelect={selectPage}
          onFollowTrail={followTrail}
        />
      ) : null}

      {mode === "index" ? (
        <IndexMode
          pages={pages}
          relationMaps={relationMaps}
          selectedNodeId={selectedNodeId}
          selectedPage={selectedPage}
          entryPages={entryPages}
          pageBySlug={pageBySlug}
          onHover={setActiveNodeId}
          onSelect={selectPage}
        />
      ) : null}

      {mode === "garden" ? (
        <GardenMode
          pages={pages}
          relationMaps={relationMaps}
          pageBySlug={pageBySlug}
          focusedNeighbors={focusedNeighbors}
          focusedNodeId={focusedNodeId}
          selectedNodeId={selectedNodeId}
          selectedPage={selectedPage}
          entryPages={entryPages}
          onHover={setActiveNodeId}
          onSelect={selectPage}
        />
      ) : null}
    </div>
  );
}

function ExplorerControls({
  activeNodeId,
  cluster,
  graphEdgeCount,
  index,
  mode,
  pageCount,
  query,
  relationCount,
  resetFilters,
  role,
  setClusterFilter,
  setMode,
  setQuery,
  setRoleFilter,
  setSort,
  sort,
}: {
  activeNodeId: string | null;
  cluster: string;
  graphEdgeCount: number;
  index: PublicWikiIndex;
  mode: ExplorerMode;
  pageCount: number;
  query: string;
  relationCount: number | null;
  resetFilters: () => void;
  role: string;
  setClusterFilter: (cluster: string) => void;
  setMode: (mode: ExplorerMode) => void;
  setQuery: (query: string) => void;
  setRoleFilter: (role: string) => void;
  setSort: (sort: SortOption) => void;
  sort: SortOption;
}) {
  return (
    <section className="border-y border-border/80 bg-card/70 py-4">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Explore mode
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {modeOptions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === item.id
                      ? "border-primary/50 bg-primary text-primary-foreground"
                      : "border-border/80 bg-background/70 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{pageCount} pages</Badge>
          <Badge variant="outline">{graphEdgeCount} visible links</Badge>
          <Badge variant="outline">{index.generatedAt.slice(0, 10)} export</Badge>
          {activeNodeId && relationCount !== null ? (
            <Badge variant="secondary">{relationCount} focused relationships</Badge>
          ) : null}
          {(query || cluster !== "all" || role !== "all" || sort !== "cluster") ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            <SearchIcon className="size-3.5" aria-hidden />
            Search
          </span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search concepts, workflows, source notes..."
            className="h-10 rounded-none bg-background/80"
          />
        </label>

        <FilterSelect
          labelText="Cluster"
          value={cluster}
          onChange={setClusterFilter}
          options={[
            { value: "all", label: "All clusters" },
            ...index.clusters.map((item) => ({
              value: item.id,
              label: `${label(item.label)} (${item.count})`,
            })),
          ]}
        />

        <FilterSelect
          labelText="Role"
          value={role}
          onChange={setRoleFilter}
          options={[
            { value: "all", label: "All roles" },
            ...index.roles.map((item) => ({
              value: item.id,
              label: `${label(item.label)} (${item.count})`,
            })),
          ]}
        />

        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            <SlidersHorizontalIcon className="size-3.5" aria-hidden />
            Sort
          </span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            className="h-10 rounded-none border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="cluster">Cluster</option>
            <option value="links">Relationship count</option>
            <option value="sources">Source notes</option>
            <option value="reading">Reading time</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function FilterSelect({
  labelText,
  onChange,
  options,
  value,
}: {
  labelText: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {labelText}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-none border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AtlasMode({
  activeNodeId,
  entryPages,
  graph,
  index,
  onFollowTrail,
  onHover,
  onSelect,
  pageBySlug,
  readingTrails,
  relationMaps,
  selectedNodeId,
  selectedPage,
}: {
  activeNodeId: string | null;
  entryPages: PublicWikiIndexPage[];
  graph: PublicWikiIndex["graph"];
  index: PublicWikiIndex;
  onFollowTrail: (trail: ReadingTrail) => void;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  readingTrails: ReadingTrail[];
  relationMaps: RelationMaps;
  selectedNodeId: string | null;
  selectedPage: PublicWikiIndexPage | null;
}) {
  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-8">
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                Reading trails
              </p>
              <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
                Start with a path, then branch.
              </h2>
            </div>
          </div>
          <div className="grid gap-px border-y border-border/80 bg-border/80 md:grid-cols-2">
            {readingTrails.map((trail) => (
              <ReadingTrailCard
                key={trail.id}
                onFollowTrail={onFollowTrail}
                onHover={onHover}
                onSelect={onSelect}
                relationMaps={relationMaps}
                trail={trail}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Atlas
            </p>
            <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
              Local and global relationships.
            </h2>
          </div>
          <WikiGraph
            nodes={graph.nodes}
            edges={graph.edges}
            activeNodeId={activeNodeId}
            selectedNodeId={selectedNodeId}
            onNodeHover={onHover}
            onNodeSelect={onSelect}
            showSelectedPanel={false}
            showNodeList={false}
          />
        </section>
      </div>

      <PageDrawer
        entryPages={entryPages}
        index={index}
        page={selectedPage}
        pageBySlug={pageBySlug}
        relationMaps={relationMaps}
        onClose={() => onSelect(null)}
        onSelect={onSelect}
      />
    </div>
  );
}

function ReadingTrailCard({
  onFollowTrail,
  onHover,
  onSelect,
  relationMaps,
  trail,
}: {
  onFollowTrail: (trail: ReadingTrail) => void;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  relationMaps: RelationMaps;
  trail: ReadingTrail;
}) {
  return (
    <article className="bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-2xl leading-tight font-light text-foreground">
            {trail.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {trail.description}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => onFollowTrail(trail)}
        >
          Follow
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {trail.pages.map((page, index) => (
          <PreviewChip
            key={page.slug}
            backlinksCount={relationMaps.backlinks.get(page.slug)?.length ?? 0}
            outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
            page={page}
            prefix={`${index + 1}.`}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </div>
    </article>
  );
}

function IndexMode({
  entryPages,
  onHover,
  onSelect,
  pageBySlug,
  pages,
  relationMaps,
  selectedNodeId,
  selectedPage,
}: {
  entryPages: PublicWikiIndexPage[];
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  pages: PublicWikiIndexPage[];
  relationMaps: RelationMaps;
  selectedNodeId: string | null;
  selectedPage: PublicWikiIndexPage | null;
}) {
  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 border-y border-border/80">
        <div className="hidden grid-cols-[minmax(13rem,1.2fr)_9rem_8rem_7rem_7rem_5rem] border-b border-border/80 bg-muted/40 px-4 py-3 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase lg:grid">
          <span>Page</span>
          <span>Cluster</span>
          <span>Role</span>
          <span>Sources</span>
          <span>Links</span>
          <span>Open</span>
        </div>
        <div className="divide-y divide-border/80">
          {pages.map((page) => (
            <IndexRow
              key={page.slug}
              active={selectedNodeId === page.slug}
              backlinksCount={relationMaps.backlinks.get(page.slug)?.length ?? 0}
              outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
              page={page}
              relationMaps={relationMaps}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </div>
        {pages.length === 0 ? <EmptyState /> : null}
      </section>

      <PageDrawer
        entryPages={entryPages}
        index={null}
        page={selectedPage}
        pageBySlug={pageBySlug}
        relationMaps={relationMaps}
        onClose={() => onSelect(null)}
        onSelect={onSelect}
      />
    </div>
  );
}

function IndexRow({
  active,
  backlinksCount,
  onHover,
  onSelect,
  outboundCount,
  page,
  relationMaps,
}: {
  active: boolean;
  backlinksCount: number;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  outboundCount: number;
  page: PublicWikiIndexPage;
  relationMaps: RelationMaps;
}) {
  return (
    <article
      className={cn(
        "group/row relative grid gap-3 bg-card px-4 py-4 transition-colors hover:bg-background lg:grid-cols-[minmax(13rem,1.2fr)_9rem_8rem_7rem_7rem_5rem] lg:items-center",
        active && "bg-background ring-1 ring-primary/20",
      )}
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <div>
        <button
          type="button"
          onClick={() => onSelect(page.slug)}
          className="text-left font-heading text-xl leading-tight font-light text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {page.title}
        </button>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground lg:hidden">
          {page.description}
        </p>
      </div>
      <span className="text-sm text-muted-foreground">{label(page.cluster)}</span>
      <span className="text-sm text-muted-foreground">{label(page.role)}</span>
      <span className="text-sm tabular-nums text-muted-foreground">
        {page.sourceNotes.length}
      </span>
      <span className="text-sm tabular-nums text-muted-foreground">
        {relationCount(page.slug, relationMaps)}
      </span>
      <Link
        href={`/wiki/${page.slug}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        Open
        <ExternalLinkIcon className="size-3.5" aria-hidden />
      </Link>
      <PageHoverPreview
        backlinksCount={backlinksCount}
        className="absolute left-4 top-14 z-30 hidden max-w-sm group-hover/row:block group-focus-within/row:block"
        outboundCount={outboundCount}
        page={page}
      />
    </article>
  );
}

function GardenMode({
  entryPages,
  focusedNeighbors,
  focusedNodeId,
  onHover,
  onSelect,
  pageBySlug,
  pages,
  relationMaps,
  selectedNodeId,
  selectedPage,
}: {
  entryPages: PublicWikiIndexPage[];
  focusedNeighbors: Set<string>;
  focusedNodeId: string | null;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  pages: PublicWikiIndexPage[];
  relationMaps: RelationMaps;
  selectedNodeId: string | null;
  selectedPage: PublicWikiIndexPage | null;
}) {
  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="grid min-w-0 gap-px border-y border-border/80 bg-border/80 md:grid-cols-2 2xl:grid-cols-3">
        {pages.map((page) => (
          <GardenCard
            key={page.slug}
            active={selectedNodeId === page.slug}
            dimmed={
              Boolean(focusedNodeId) &&
              focusedNodeId !== page.slug &&
              !focusedNeighbors.has(page.slug)
            }
            focused={focusedNodeId === page.slug || focusedNeighbors.has(page.slug)}
            page={page}
            pageBySlug={pageBySlug}
            relationMaps={relationMaps}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
        {pages.length === 0 ? <EmptyState /> : null}
      </section>

      <PageDrawer
        entryPages={entryPages}
        index={null}
        page={selectedPage}
        pageBySlug={pageBySlug}
        relationMaps={relationMaps}
        onClose={() => onSelect(null)}
        onSelect={onSelect}
      />
    </div>
  );
}

function GardenCard({
  active,
  dimmed,
  focused,
  onHover,
  onSelect,
  page,
  pageBySlug,
  relationMaps,
}: {
  active: boolean;
  dimmed: boolean;
  focused: boolean;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  page: PublicWikiIndexPage;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  relationMaps: RelationMaps;
}) {
  const connectedPages = pagesFromSlugs(
    unique([
      ...(relationMaps.outbound.get(page.slug) ?? []),
      ...(relationMaps.backlinks.get(page.slug) ?? []),
    ]),
    pageBySlug,
  ).slice(0, 4);

  return (
    <article
      className={cn(
        "group/card relative flex min-h-80 flex-col bg-card/75 transition-colors duration-300 hover:bg-background",
        active && "bg-background ring-1 ring-primary/20",
        focused && !active && "bg-background",
        dimmed && "opacity-55",
      )}
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(page.slug)}
      onBlur={() => onHover(null)}
    >
      <div className="relative h-28 overflow-hidden border-b border-border/70 bg-muted">
        <Image
          src={page.heroImage}
          alt=""
          width={1200}
          height={630}
          unoptimized
          className="size-full object-cover grayscale transition-transform duration-500 group-hover/card:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/35 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{label(page.cluster)}</Badge>
          <Badge variant="outline">{label(page.role)}</Badge>
        </div>
        <Link
          href={`/wiki/${page.slug}`}
          className="font-heading text-xl leading-tight font-light text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {page.title}
        </Link>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {page.description}
        </p>

        {connectedPages.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Connected to
            </p>
            <div className="flex flex-wrap gap-1.5">
              {connectedPages.map((item) => (
                <PreviewChip
                  key={item.slug}
                  backlinksCount={relationMaps.backlinks.get(item.slug)?.length ?? 0}
                  outboundCount={relationMaps.outbound.get(item.slug)?.length ?? 0}
                  page={item}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 text-xs font-medium text-muted-foreground">
          <span>{page.readingMinutes} min read</span>
          <span>
            {page.sourceNotes.length} sources · {relationCount(page.slug, relationMaps)} links
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 w-full rounded-full"
          onClick={() => onSelect(page.slug)}
        >
          Preview relationships
        </Button>
      </div>

      <PageHoverPreview
        backlinksCount={relationMaps.backlinks.get(page.slug)?.length ?? 0}
        className="absolute left-4 right-4 top-16 z-30 hidden group-hover/card:block group-focus-within/card:block"
        outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
        page={page}
      />
    </article>
  );
}

function PreviewChip({
  backlinksCount,
  onHover,
  onSelect,
  outboundCount,
  page,
  prefix,
}: {
  backlinksCount: number;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  outboundCount: number;
  page: PublicWikiIndexPage;
  prefix?: string;
}) {
  return (
    <span
      className="group/chip relative inline-flex"
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        onClick={() => onSelect(page.slug)}
        className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {prefix ? <span className="mr-1 text-foreground">{prefix}</span> : null}
        {page.title}
      </button>
      <PageHoverPreview
        backlinksCount={backlinksCount}
        className="absolute left-0 top-full z-40 mt-2 hidden w-72 group-hover/chip:block group-focus-within/chip:block"
        outboundCount={outboundCount}
        page={page}
      />
    </span>
  );
}

function PageHoverPreview({
  backlinksCount,
  className,
  outboundCount,
  page,
}: {
  backlinksCount: number;
  className?: string;
  outboundCount: number;
  page: PublicWikiIndexPage;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none border border-border/80 bg-background/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.14)] backdrop-blur",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Badge variant="secondary">{label(page.cluster)}</Badge>
        <Badge variant="outline">{label(page.role)}</Badge>
      </div>
      <p className="font-heading text-lg leading-tight font-light text-foreground">
        {page.title}
      </p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {page.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        <span>{page.sourceNotes.length} sources</span>
        <span>{outboundCount} outbound</span>
        <span>{backlinksCount} backlinks</span>
      </div>
    </div>
  );
}

function PageDrawer({
  entryPages,
  index,
  onClose,
  onSelect,
  page,
  pageBySlug,
  relationMaps,
}: {
  entryPages: PublicWikiIndexPage[];
  index: PublicWikiIndex | null;
  onClose: () => void;
  onSelect: (slug: string | null) => void;
  page: PublicWikiIndexPage | null;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  relationMaps: RelationMaps;
}) {
  const outboundPages = page
    ? pagesFromSlugs(relationMaps.outbound.get(page.slug) ?? [], pageBySlug)
    : [];
  const backlinkPages = page
    ? pagesFromSlugs(relationMaps.backlinks.get(page.slug) ?? [], pageBySlug)
    : [];

  return (
    <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
      <section className="border-y border-border/80 bg-card/75 py-5">
        {page ? (
          <div className="px-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                  Selected page
                </p>
                <h2 className="mt-3 font-heading text-3xl leading-tight font-light text-foreground">
                  {page.title}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Clear selected page"
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary">{label(page.cluster)}</Badge>
              <Badge variant="outline">{label(page.role)}</Badge>
              <Badge variant="outline">{page.readingMinutes} min</Badge>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {page.description}
            </p>
            <Link
              href={`/wiki/${page.slug}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/85"
            >
              Open page
              <ExternalLinkIcon className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <div className="px-4">
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Select a page
            </p>
            <h2 className="mt-3 font-heading text-3xl leading-tight font-light text-foreground">
              Click a graph node, card, trail item, or row.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The drawer shows backlinks, outbound links, source count, and a
              quick route into the page.
            </p>
          </div>
        )}
      </section>

      {page ? (
        <>
          <RelationList
            emptyText="No outbound links were found for this page."
            icon={<ArrowRightIcon className="size-4" aria-hidden />}
            labelText="Outbound links"
            onSelect={onSelect}
            pages={outboundPages}
          />
          <RelationList
            emptyText="No backlinks were found for this page."
            icon={<BookOpenIcon className="size-4" aria-hidden />}
            labelText="Backlinks"
            onSelect={onSelect}
            pages={backlinkPages}
          />
          {page.sourceNotes.length > 0 ? (
            <section className="border-y border-border/80 py-4">
              <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                Source trail
              </p>
              <div className="mt-3 space-y-3">
                {page.sourceNotes.slice(0, 3).map((note, noteIndex) => (
                  <p
                    key={`${page.slug}-source-${noteIndex}`}
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    {note}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <RelationList
          emptyText="No entry points available."
          icon={<MapIcon className="size-4" aria-hidden />}
          labelText={index ? `${index.pages.length} pages available` : "Good entry points"}
          onSelect={onSelect}
          pages={entryPages}
        />
      )}
    </aside>
  );
}

function RelationList({
  emptyText,
  icon,
  labelText,
  onSelect,
  pages,
}: {
  emptyText: string;
  icon: ReactNode;
  labelText: string;
  onSelect: (slug: string | null) => void;
  pages: PublicWikiIndexPage[];
}) {
  return (
    <section className="border-y border-border/80 py-4">
      <p className="flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {icon}
        {labelText}
      </p>
      <div className="mt-3 space-y-2">
        {pages.length > 0 ? (
          pages.slice(0, 8).map((page) => (
            <button
              key={page.slug}
              type="button"
              onClick={() => onSelect(page.slug)}
              className="block w-full border-t border-border/70 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-medium text-foreground">{page.title}</span>
              <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
                {page.description}
              </span>
            </button>
          ))
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full border-y border-border/80 bg-card/70 p-8 text-center">
      <h2 className="font-heading text-xl font-light text-foreground">
        No pages match those filters.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Clear the filters or search a broader term.
      </p>
    </div>
  );
}
