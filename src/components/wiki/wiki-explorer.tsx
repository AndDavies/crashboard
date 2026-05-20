"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ExternalLinkIcon,
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
import {
  clusterLabel,
  sortClustersForReaders,
  type WikiReaderPath,
} from "@/lib/public-wiki/reader-paths";
import { cn } from "@/lib/utils";
import type { PublicWikiIndex, PublicWikiIndexPage } from "@/lib/public-wiki/types";

type ExplorerMode = "paths" | "all-pages" | "map";
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

type ReaderPathWithPages = WikiReaderPath & {
  primaryPage: PublicWikiIndexPage | null;
  pages: PublicWikiIndexPage[];
};

const modeOptions: Array<{
  id: ExplorerMode;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  { id: "paths", label: "Paths", icon: BookOpenIcon },
  { id: "all-pages", label: "All pages", icon: ListIcon },
  { id: "map", label: "Map", icon: MapIcon },
];

function label(input: string) {
  return input
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function roleWeight(role: string) {
  if (role === "hub") return 36;
  if (role === "concept") return 22;
  return 10;
}

function relationCount(slug: string, relationMaps: RelationMaps) {
  return relationMaps.degree.get(slug) ?? 0;
}

function clusterSortKey(cluster: string) {
  return cluster === "foundations" ? "000-start-here" : clusterLabel(cluster);
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

export function WikiExplorer({
  index,
  readerPaths,
}: {
  index: PublicWikiIndex;
  readerPaths: ReaderPathWithPages[];
}) {
  const [mode, setMode] = useState<ExplorerMode>("paths");
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState<SortOption>("cluster");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showWholeVaultMap, setShowWholeVaultMap] = useState(false);
  const [showMobileMap, setShowMobileMap] = useState(false);
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
          title: `${clusterLabel(item.label)} trail`,
          description: `A route through ${trailPages.length} ${clusterLabel(item.label).toLowerCase()} pages with ${sourceCount} source notes and ${linkCount} relationships.`,
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
      return `${clusterSortKey(a.cluster)}-${a.title}`.localeCompare(
        `${clusterSortKey(b.cluster)}-${b.title}`,
      );
    });
  }, [cluster, deferredQuery, index.pages, relationMaps, role, sort]);

  const mapIds = useMemo(() => {
    if (showWholeVaultMap) return new Set(index.pages.map((page) => page.slug));
    if (selectedNodeId) {
      return new Set([
        selectedNodeId,
        ...(relationMaps.neighbors.get(selectedNodeId) ?? new Set<string>()),
      ]);
    }
    if (cluster !== "all") {
      return new Set(index.pages.filter((page) => page.cluster === cluster).map((page) => page.slug));
    }
    const pathSlugs = readerPaths.flatMap((path) => path.pages.map((page) => page.slug));
    return new Set(pathSlugs.length > 0 ? pathSlugs : entryPages.map((page) => page.slug));
  }, [
    cluster,
    entryPages,
    index.pages,
    readerPaths,
    relationMaps.neighbors,
    selectedNodeId,
    showWholeVaultMap,
  ]);

  const mapGraph = useMemo(() => {
    return {
      nodes: index.graph.nodes.filter((node) => mapIds.has(node.id)),
      edges: index.graph.edges.filter(
        (edge) => mapIds.has(edge.source) && mapIds.has(edge.target),
      ),
    };
  }, [index.graph.edges, index.graph.nodes, mapIds]);

  const selectedPage = selectedNodeId ? pageBySlug.get(selectedNodeId) ?? null : null;
  const focusedNodeId = selectedNodeId ?? activeNodeId;

  function setClusterFilter(nextCluster: string) {
    setCluster(nextCluster);
    setActiveNodeId(null);
    setSelectedNodeId(null);
    setShowWholeVaultMap(false);
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
    setShowWholeVaultMap(false);
  }

  function followTrail(trail: ReadingTrail) {
    setMode("paths");
    setClusterFilter(trail.clusterId);
    selectPage(trail.pages[0]?.slug ?? null);
  }

  return (
    <div className="space-y-8">
      <ExplorerControls
        activeNodeId={focusedNodeId}
        cluster={cluster}
        graphEdgeCount={mapGraph.edges.length}
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

      {mode === "paths" ? (
        <PathsMode
          index={index}
          readerPaths={readerPaths}
          readingTrails={readingTrails}
          relationMaps={relationMaps}
          pageBySlug={pageBySlug}
          selectedPage={selectedPage}
          onHover={setActiveNodeId}
          onSelect={selectPage}
          onFollowTrail={followTrail}
        />
      ) : null}

      {mode === "all-pages" ? (
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

      {mode === "map" ? (
        <MapMode
          activeNodeId={activeNodeId}
          entryPages={entryPages}
          graph={mapGraph}
          mapContext={
            showWholeVaultMap
              ? "Whole vault map"
              : selectedNodeId
                ? "Selected page neighborhood"
                : cluster !== "all"
                  ? `${clusterLabel(cluster)} cluster`
                  : "Start here paths"
          }
          pageBySlug={pageBySlug}
          relationMaps={relationMaps}
          selectedNodeId={selectedNodeId}
          selectedPage={selectedPage}
          showMobileMap={showMobileMap}
          showWholeVaultMap={showWholeVaultMap}
          onRevealMobileMap={() => setShowMobileMap(true)}
          onShowWholeVaultMap={() => setShowWholeVaultMap((current) => !current)}
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
  const showAllPageFilters = mode === "all-pages";
  const showMapFilter = mode === "map";

  return (
    <section className="border-y border-border/80 bg-card/70 py-4">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Reader view
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
          {mode === "map" ? (
            <Badge variant="outline">{graphEdgeCount} visible map links</Badge>
          ) : null}
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

      {showAllPageFilters || showMapFilter ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
          {showAllPageFilters ? (
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
          ) : (
            <div className="text-sm leading-relaxed text-muted-foreground">
              Scope the map by cluster, select a page, or reveal the whole vault.
            </div>
          )}

          <FilterSelect
            labelText="Cluster"
            value={cluster}
            onChange={setClusterFilter}
            options={[
              { value: "all", label: "All clusters" },
              ...sortClustersForReaders(index).map((item) => ({
                value: item.id,
                label: `${clusterLabel(item.label)} (${item.count})`,
              })),
            ]}
          />

          {showAllPageFilters ? (
            <>
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
            </>
          ) : null}
        </div>
      ) : null}
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

function PathsMode({
  index,
  onFollowTrail,
  onHover,
  onSelect,
  pageBySlug,
  readerPaths,
  readingTrails,
  relationMaps,
  selectedPage,
}: {
  index: PublicWikiIndex;
  onFollowTrail: (trail: ReadingTrail) => void;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  readerPaths: ReaderPathWithPages[];
  readingTrails: ReadingTrail[];
  relationMaps: RelationMaps;
  selectedPage: PublicWikiIndexPage | null;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-8",
        selectedPage && "xl:grid-cols-[minmax(0,1fr)_24rem]",
      )}
    >
      <div className="min-w-0 space-y-8">
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                Start here
              </p>
              <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
                Pick the door closest to what you need.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Each path opens a main page first, then points to supporting notes
                once the topic has a clear shape.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {readerPaths.map((path) => (
              <ReaderPathCard
                key={path.id}
                onHover={onHover}
                onSelect={onSelect}
                path={path}
                relationMaps={relationMaps}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                Reading trails
              </p>
              <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
                Then branch into a cluster.
              </h2>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {readingTrails.map((trail, index) => (
              <ReadingTrailCard
                key={trail.id}
                className={
                  index === readingTrails.length - 1 && readingTrails.length % 2 === 1
                    ? "md:col-span-2"
                    : ""
                }
                onFollowTrail={onFollowTrail}
                onHover={onHover}
                onSelect={onSelect}
                relationMaps={relationMaps}
                trail={trail}
              />
            ))}
          </div>
        </section>
      </div>

      {selectedPage ? (
        <PageDrawer
          entryPages={[]}
          index={index}
          page={selectedPage}
          pageBySlug={pageBySlug}
          relationMaps={relationMaps}
          onClose={() => onSelect(null)}
          onSelect={onSelect}
        />
      ) : null}
    </div>
  );
}

function ReaderPathCard({
  onHover,
  onSelect,
  path,
  relationMaps,
}: {
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  path: ReaderPathWithPages;
  relationMaps: RelationMaps;
}) {
  const primary = path.primaryPage;

  return (
    <article
      className="group/path relative flex min-h-80 flex-col border-y border-border/80 bg-card/75 transition-colors hover:border-foreground/35 hover:bg-background focus-within:border-foreground/35"
      onMouseEnter={() => {
        if (primary) onHover(primary.slug);
      }}
      onMouseLeave={() => onHover(null)}
    >
      <span
        className="pointer-events-none absolute left-0 top-0 h-full w-px bg-accent opacity-0 transition-opacity duration-200 group-hover/path:opacity-100 group-focus-within/path:opacity-100"
        aria-hidden
      />
      {primary ? (
        <Link
          href={`/wiki/${primary.slug}`}
          className="absolute inset-0 z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onFocus={() => onHover(primary.slug)}
          onBlur={() => onHover(null)}
          aria-label={`Start with ${primary.title}`}
        >
          <span className="sr-only">Start with {primary.title}</span>
        </Link>
      ) : null}

      <div className="relative z-0 flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Start here
            </p>
            <h3 className="mt-3 font-heading text-2xl leading-tight font-light text-foreground">
              {path.title}
            </h3>
          </div>
          <MiniPathMap />
        </div>

        <p className="mt-4 text-base leading-relaxed text-foreground">
          {path.promise}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {path.description}
        </p>
      </div>

      <div className="px-5 pb-5">
        {path.pages.length > 1 ? (
          <div className="relative z-30 mb-4">
            <p className="mb-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Related pages
            </p>
            <div className="flex flex-wrap gap-1.5">
              {path.pages.slice(1, 4).map((page) => (
                <PreviewChip
                  key={page.slug}
                  backlinksCount={relationMaps.backlinks.get(page.slug)?.length ?? 0}
                  outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
                  page={page}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ) : null}

        {primary ? (
          <div className="pointer-events-none -mx-5 -mb-5 border-t border-border/80 px-5 py-4 text-sm font-semibold text-foreground transition-colors group-hover/path:border-foreground/30 group-hover/path:bg-muted/35">
            <span className="inline-flex items-center gap-2">
              Start with {primary.title}
              <ArrowRightIcon
                className="size-4 transition-transform duration-200 motion-safe:group-hover/path:translate-x-1"
                aria-hidden
              />
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Path page unavailable.</p>
        )}
      </div>
    </article>
  );
}

function MiniPathMap() {
  return (
    <div className="relative mt-1 h-10 w-24 shrink-0 text-border" aria-hidden>
      <span className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-current" />
      <span className="absolute left-3 right-3 top-1/2 h-px origin-left -translate-y-1/2 scale-x-0 bg-accent transition-transform duration-300 motion-safe:group-hover/path:scale-x-100 motion-safe:group-focus-within/path:scale-x-100" />
      <span className="absolute left-2 top-1/2 size-3 -translate-y-1/2 bg-foreground transition-transform duration-200 motion-safe:group-hover/path:scale-110" />
      <span className="absolute left-[35%] top-1/2 size-2 -translate-y-1/2 bg-muted-foreground/65 transition-colors duration-200 group-hover/path:bg-accent" />
      <span className="absolute left-[59%] top-1/2 size-2 -translate-y-1/2 bg-muted-foreground/65 transition-colors duration-200 group-hover/path:bg-accent" />
      <span className="absolute right-2 top-1/2 size-2 -translate-y-1/2 bg-muted-foreground/65 transition-colors duration-200 group-hover/path:bg-accent" />
    </div>
  );
}

function MapMode({
  activeNodeId,
  entryPages,
  graph,
  mapContext,
  onHover,
  onRevealMobileMap,
  onSelect,
  onShowWholeVaultMap,
  pageBySlug,
  relationMaps,
  selectedNodeId,
  selectedPage,
  showMobileMap,
  showWholeVaultMap,
}: {
  activeNodeId: string | null;
  entryPages: PublicWikiIndexPage[];
  graph: PublicWikiIndex["graph"];
  mapContext: string;
  onHover: (slug: string | null) => void;
  onRevealMobileMap: () => void;
  onSelect: (slug: string | null) => void;
  onShowWholeVaultMap: () => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  relationMaps: RelationMaps;
  selectedNodeId: string | null;
  selectedPage: PublicWikiIndexPage | null;
  showMobileMap: boolean;
  showWholeVaultMap: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Map view
            </p>
            <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
              {mapContext}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The graph is scoped by default so it explains the current path,
              cluster, or selected page before exposing the whole vault.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onShowWholeVaultMap}
          >
            {showWholeVaultMap ? "Show contextual map" : "Show whole vault map"}
          </Button>
        </div>

        <div className="md:hidden">
          {!showMobileMap ? (
            <button
              type="button"
              onClick={onRevealMobileMap}
              className="w-full border-y border-border/80 bg-card/75 p-5 text-left transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-heading text-2xl font-light text-foreground">
                Reveal map
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                Graphs are dense on mobile, so the map stays hidden until you ask
                for it.
              </span>
            </button>
          ) : null}
        </div>

        <div className={cn("md:block", showMobileMap ? "block" : "hidden")}>
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
        </div>
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

function ReadingTrailCard({
  className,
  onFollowTrail,
  onHover,
  onSelect,
  relationMaps,
  trail,
}: {
  className?: string;
  onFollowTrail: (trail: ReadingTrail) => void;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  relationMaps: RelationMaps;
  trail: ReadingTrail;
}) {
  return (
    <article
      className={cn(
        "group/trail flex min-h-72 flex-col border-y border-border/80 bg-card/75 transition-colors hover:border-foreground/35 hover:bg-background",
        className,
      )}
    >
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Reading trail
            </p>
            <h3 className="mt-2 font-heading text-2xl leading-tight font-light text-foreground">
              {trail.title}
            </h3>
          </div>
          <div className="shrink-0 text-right font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {trail.pages.length} steps
          </div>
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {trail.description}
        </p>

        <div className="mt-5">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Route
          </p>
          <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {trail.pages.map((page, index) => (
              <li key={page.slug} className="flex min-w-0 flex-1 items-center gap-2">
                <RouteStep
                  backlinksCount={relationMaps.backlinks.get(page.slug)?.length ?? 0}
                  index={index}
                  onHover={onHover}
                  onSelect={onSelect}
                  outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
                  page={page}
                />
                {index < trail.pages.length - 1 ? (
                  <ArrowRightIcon
                    className="hidden size-4 shrink-0 text-muted-foreground/55 sm:block"
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <button
        type="button"
        className="flex items-center justify-between border-t border-border/80 px-5 py-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onFollowTrail(trail)}
      >
        Follow trail
        <ArrowRightIcon
          className="size-4 transition-transform duration-200 motion-safe:group-hover/trail:translate-x-1"
          aria-hidden
        />
      </button>
    </article>
  );
}

function RouteStep({
  backlinksCount,
  index,
  onHover,
  onSelect,
  outboundCount,
  page,
}: {
  backlinksCount: number;
  index: number;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  outboundCount: number;
  page: PublicWikiIndexPage;
}) {
  return (
    <span
      className="group/step relative block min-w-0 flex-1"
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        onClick={() => onSelect(page.slug)}
        className="block min-h-20 w-full border border-border/80 bg-background/70 px-3 py-2 text-left transition-colors hover:border-primary/30 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="mt-2 line-clamp-2 block text-xs font-medium leading-snug text-foreground">
          {page.title}
        </span>
      </button>
      <PageHoverPreview
        backlinksCount={backlinksCount}
        className="absolute left-0 top-full z-40 mt-2 hidden w-72 group-hover/step:block group-focus-within/step:block"
        outboundCount={outboundCount}
        page={page}
      />
    </span>
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
      <span className="text-sm text-muted-foreground">{clusterLabel(page.cluster)}</span>
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
        <Badge variant="secondary">{clusterLabel(page.cluster)}</Badge>
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
              <Badge variant="secondary">{clusterLabel(page.cluster)}</Badge>
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
