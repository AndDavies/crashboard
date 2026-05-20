"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpDownIcon,
  BookOpenIcon,
  ListIcon,
  MapIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import {
  clusterLabel,
  sortClustersForReaders,
  type WikiReaderPath,
} from "@/lib/public-wiki/reader-paths";
import { cn } from "@/lib/utils";
import type {
  PublicWikiIndex,
  PublicWikiIndexPage,
} from "@/lib/public-wiki/types";

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

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: "cluster", label: "Cluster" },
  { value: "links", label: "Relationship count" },
  { value: "sources", label: "Source notes" },
  { value: "reading", label: "Reading time" },
  { value: "title", label: "Title" },
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

function groupPagesByCluster(pages: PublicWikiIndexPage[]) {
  const groups = new Map<string, PublicWikiIndexPage[]>();
  for (const page of pages) {
    const existing = groups.get(page.cluster) ?? [];
    existing.push(page);
    groups.set(page.cluster, existing);
  }
  return Array.from(groups.entries()).toSorted(([a], [b]) =>
    clusterSortKey(a).localeCompare(clusterSortKey(b)),
  );
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
          description: `${trailPages.length} ${clusterLabel(item.label).toLowerCase()} pages · ${sourceCount} sources · ${linkCount} links`,
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
      return new Set(
        index.pages
          .filter((page) => page.cluster === cluster)
          .map((page) => page.slug),
      );
    }
    const pathSlugs = readerPaths.flatMap((path) =>
      path.pages.map((page) => page.slug),
    );
    return new Set(
      pathSlugs.length > 0 ? pathSlugs : entryPages.map((page) => page.slug),
    );
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
  const filtersDirty =
    Boolean(query) || cluster !== "all" || role !== "all" || sort !== "cluster";

  useEffect(() => {
    if (!selectedNodeId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedNodeId(null);
        setActiveNodeId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId]);

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
    setMode("all-pages");
    setClusterFilter(trail.clusterId);
    selectPage(trail.pages[0]?.slug ?? null);
  }

  return (
    <div className="space-y-10">
      <ExplorerControls
        cluster={cluster}
        filtersDirty={filtersDirty}
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
          activeNodeId={focusedNodeId}
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
  cluster,
  filtersDirty,
  index,
  mode,
  pageCount,
  query,
  resetFilters,
  role,
  setClusterFilter,
  setMode,
  setQuery,
  setRoleFilter,
  setSort,
  sort,
}: {
  cluster: string;
  filtersDirty: boolean;
  index: PublicWikiIndex;
  mode: ExplorerMode;
  pageCount: number;
  query: string;
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

  const clusterOptions = [
    { value: "all", label: "All clusters" },
    ...sortClustersForReaders(index).map((item) => ({
      value: item.id,
      label: `${clusterLabel(item.label)} (${item.count})`,
    })),
  ];
  const roleOptions = [
    { value: "all", label: "All roles" },
    ...index.roles.map((item) => ({
      value: item.id,
      label: `${label(item.label)} (${item.count})`,
    })),
  ];

  return (
    <section
      className="border border-border/80 bg-card/70"
      aria-label="Explorer controls"
    >
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Reader view
          </p>
          <div
            className="mt-2 inline-flex border border-border/80 bg-background"
            role="tablist"
            aria-label="Reader view"
          >
            {modeOptions.map((item, itemIndex) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    itemIndex > 0 && "border-l border-border/80",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.16em]">
            {pageCount.toLocaleString()} pages
          </span>
          {!showAllPageFilters && filtersDirty ? (
            <span className="font-mono uppercase tracking-[0.16em] text-foreground">
              Filtered · {clusterLabel(cluster)}
              {role !== "all" ? ` · ${label(role)}` : ""}
            </span>
          ) : null}
          {filtersDirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {showAllPageFilters || showMapFilter ? (
        <div className="grid gap-4 border-t border-border/80 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem] lg:items-end">
          {showAllPageFilters ? (
            <label className="space-y-2">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <SearchIcon className="size-3.5" aria-hidden />
                Search
              </span>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search concepts, workflows, source notes..."
                className="h-10 rounded-none border-border/80 bg-background"
              />
            </label>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground lg:max-w-md">
              Scope the map by cluster, click a node to focus a neighborhood, or
              reveal the whole vault.
            </p>
          )}

          <FilterSelect
            labelText="Cluster"
            value={cluster}
            onValueChange={setClusterFilter}
            options={clusterOptions}
          />

          {showAllPageFilters ? (
            <>
              <FilterSelect
                labelText="Role"
                value={role}
                onValueChange={setRoleFilter}
                options={roleOptions}
              />

              <FilterSelect
                labelText="Sort"
                icon={<ArrowUpDownIcon className="size-3.5" aria-hidden />}
                value={sort}
                onValueChange={(next) => setSort(next as SortOption)}
                options={sortOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </>
          ) : (
            <div className="hidden lg:block lg:col-span-2" />
          )}
        </div>
      ) : null}
    </section>
  );
}

function FilterSelect({
  labelText,
  icon,
  options,
  value,
  onValueChange,
}: {
  labelText: string;
  icon?: ReactNode;
  options: Array<{ label: string; value: string }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const valueLabel =
    options.find((option) => option.value === value)?.label ?? labelText;
  return (
    <label className="space-y-2">
      <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {labelText}
      </span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onValueChange(next);
        }}
      >
        <SelectTrigger aria-label={labelText}>
          <SelectValue>{valueLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        "grid min-w-0 gap-10",
        selectedPage && "xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
      <div className="min-w-0 space-y-12">
        <section>
          <SectionHeader
            eyebrow="Start here"
            title="Pick the door closest to what you need."
            description="Each path opens a primary page, then points to supporting notes once the topic has a clear shape."
          />
          <div className="wiki-stack-fade mt-6 grid gap-px border border-border/80 bg-border/80 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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
          <SectionHeader
            eyebrow="Reading trails"
            title="Then branch into a cluster."
            description="Auto-generated routes through the highest-linked pages in each cluster."
          />
          <div className="wiki-stack-fade mt-6 grid gap-px border border-border/80 bg-border/80 md:grid-cols-2">
            {readingTrails.map((trail, trailIndex) => (
              <ReadingTrailCard
                key={trail.id}
                className={
                  trailIndex === readingTrails.length - 1 &&
                  readingTrails.length % 2 === 1
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

function SectionHeader({
  description,
  eyebrow,
  title,
  actions,
}: {
  description?: string;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
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
  const supporting = path.pages.slice(1);
  const visibleSupporting = supporting.slice(0, 3);
  const remaining = supporting.length - visibleSupporting.length;

  return (
    <article
      className="group/path flex h-full flex-col bg-card/70 motion-safe:transition-colors hover:bg-card focus-within:bg-card"
      onMouseEnter={() => {
        if (primary) onHover(primary.slug);
      }}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Start here
        </p>
        <h3 className="font-heading text-2xl font-light leading-tight text-foreground">
          {path.title}
        </h3>
        <p className="text-base leading-relaxed text-foreground">{path.promise}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {path.description}
        </p>

        {visibleSupporting.length > 0 ? (
          <div className="mt-auto pt-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Related pages
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleSupporting.map((page) => (
                <PreviewChip
                  key={page.slug}
                  backlinksCount={
                    relationMaps.backlinks.get(page.slug)?.length ?? 0
                  }
                  outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
                  page={page}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              ))}
              {remaining > 0 ? (
                <span className="border border-border/80 bg-background/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  +{remaining} more
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {primary ? (
        <Link
          href={`/wiki/${primary.slug}`}
          className="flex items-center justify-between border-t border-border/80 bg-card/40 px-5 py-4 text-sm font-medium text-foreground motion-safe:transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onFocus={() => onHover(primary.slug)}
          onBlur={() => onHover(null)}
        >
          <span className="inline-flex items-center gap-2">
            Start with {primary.title}
          </span>
          <ArrowRightIcon
            className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover/path:translate-x-1"
            aria-hidden
          />
        </Link>
      ) : (
        <p className="border-t border-border/80 bg-card/40 px-5 py-4 text-sm text-muted-foreground">
          Path page unavailable.
        </p>
      )}
    </article>
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
    <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-5">
        <SectionHeader
          eyebrow="Map view"
          title={mapContext}
          description="The graph is scoped by default so it explains the current path, cluster, or selected page before exposing the whole vault."
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onShowWholeVaultMap}
            >
              {showWholeVaultMap ? "Show contextual map" : "Show whole vault map"}
            </Button>
          }
        />

        <div className="md:hidden">
          {!showMobileMap ? (
            <button
              type="button"
              onClick={onRevealMobileMap}
              className="flex w-full items-center justify-between border border-border/80 bg-card/70 p-5 text-left motion-safe:transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Tap to reveal
                </span>
                <span className="mt-2 block font-heading text-2xl font-light text-foreground">
                  Map
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                  Graphs are dense on mobile, so the map stays hidden until you
                  ask for it.
                </span>
              </span>
              <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
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
        "group/trail flex flex-col bg-card/70 motion-safe:transition-colors hover:bg-card",
        className,
      )}
    >
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Reading trail
            </p>
            <h3 className="mt-2 font-heading text-2xl font-light leading-tight text-foreground">
              {trail.title}
            </h3>
          </div>
          <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {trail.pages.length} steps
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {trail.description}
        </p>

        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Route
          </p>
          <ol className="mt-3 grid gap-px border border-border/80 bg-border/80 sm:grid-cols-2 xl:grid-cols-4">
            {trail.pages.map((page, stepIndex) => (
              <li key={page.slug} className="bg-card/70">
                <RouteStep
                  backlinksCount={
                    relationMaps.backlinks.get(page.slug)?.length ?? 0
                  }
                  index={stepIndex}
                  isLast={stepIndex === trail.pages.length - 1}
                  onHover={onHover}
                  onSelect={onSelect}
                  outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
                  page={page}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      <button
        type="button"
        className="flex items-center justify-between border-t border-border/80 bg-card/40 px-5 py-4 text-left text-sm font-medium text-foreground motion-safe:transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => onFollowTrail(trail)}
      >
        Follow trail
        <ArrowRightIcon
          className="size-4 motion-safe:transition-transform motion-safe:group-hover/trail:translate-x-1"
          aria-hidden
        />
      </button>
    </article>
  );
}

function RouteStep({
  backlinksCount,
  index,
  isLast,
  onHover,
  onSelect,
  outboundCount,
  page,
}: {
  backlinksCount: number;
  index: number;
  isLast: boolean;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  outboundCount: number;
  page: PublicWikiIndexPage;
}) {
  return (
    <div
      className="group/step relative h-full"
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        onClick={() => onSelect(page.slug)}
        className="flex h-full w-full items-start gap-3 px-3 py-3 text-left motion-safe:transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex-1">
          <span className="block line-clamp-2 text-xs font-medium leading-snug text-foreground">
            {page.title}
          </span>
        </span>
        {!isLast ? (
          <ArrowRightIcon
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
        ) : null}
      </button>
      <PageHoverPreview
        backlinksCount={backlinksCount}
        className="absolute left-0 right-0 top-full z-40 mt-1 hidden group-hover/step:block group-focus-within/step:block sm:right-auto sm:w-72"
        outboundCount={outboundCount}
        page={page}
      />
    </div>
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
    <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 border border-border/80">
        <div className="hidden grid-cols-[minmax(13rem,1.2fr)_9rem_8rem_5rem_5rem_5rem] border-b border-border/80 bg-muted/40 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>Page</span>
          <span>Cluster</span>
          <span>Role</span>
          <span className="text-right">Sources</span>
          <span className="text-right">Links</span>
          <span className="text-right">Open</span>
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
        "group/row relative grid gap-y-2 gap-x-3 bg-card/70 px-4 py-4 motion-safe:transition-colors hover:bg-card lg:grid-cols-[minmax(13rem,1.2fr)_9rem_8rem_5rem_5rem_5rem] lg:items-center",
        active && "border-l-2 border-accent bg-card pl-[calc(1rem-2px)]",
      )}
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onSelect(page.slug)}
          className="block w-full text-left font-heading text-xl font-light leading-tight text-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {page.title}
        </button>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground lg:hidden">
          {page.description}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground lg:hidden">
          <div className="flex items-center gap-1.5">
            <dt className="font-mono uppercase tracking-[0.16em] text-[10px]">Cluster</dt>
            <dd className="text-foreground">{clusterLabel(page.cluster)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="font-mono uppercase tracking-[0.16em] text-[10px]">Role</dt>
            <dd className="text-foreground">{label(page.role)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="font-mono uppercase tracking-[0.16em] text-[10px]">Sources</dt>
            <dd className="tabular-nums text-foreground">{page.sourceNotes.length}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="font-mono uppercase tracking-[0.16em] text-[10px]">Links</dt>
            <dd className="tabular-nums text-foreground">
              {relationCount(page.slug, relationMaps)}
            </dd>
          </div>
        </dl>
      </div>
      <span className="hidden text-sm text-muted-foreground lg:block">
        {clusterLabel(page.cluster)}
      </span>
      <span className="hidden text-sm text-muted-foreground lg:block">
        {label(page.role)}
      </span>
      <span className="hidden text-sm tabular-nums text-muted-foreground lg:block lg:text-right">
        {page.sourceNotes.length}
      </span>
      <span className="hidden text-sm tabular-nums text-muted-foreground lg:block lg:text-right">
        {relationCount(page.slug, relationMaps)}
      </span>
      <Link
        href={`/wiki/${page.slug}`}
        className="hidden items-center justify-end gap-1 text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-accent lg:inline-flex"
      >
        Open
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </Link>
      <Link
        href={`/wiki/${page.slug}`}
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-foreground underline decoration-accent underline-offset-4 lg:hidden"
      >
        Open
        <ArrowRightIcon className="size-3.5" aria-hidden />
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
        className="border border-border/80 bg-background/70 px-2.5 py-1 text-left text-xs font-medium text-muted-foreground motion-safe:transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {clusterLabel(page.cluster)} · {label(page.role)}
      </p>
      <p className="mt-2 font-heading text-lg font-light leading-tight text-foreground">
        {page.title}
      </p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {page.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
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
    <aside
      className="space-y-5 xl:sticky xl:top-24 xl:self-start"
      aria-label="Selected page details"
    >
      <section className="border border-border/80 bg-card/70 p-5">
        {page ? (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Selected page
                </p>
                <h2 className="mt-3 font-heading text-3xl font-light leading-tight text-foreground">
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

            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {clusterLabel(page.cluster)} · {label(page.role)} · {page.readingMinutes} min
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {page.description}
            </p>
            <Link
              href={`/wiki/${page.slug}`}
              className="mt-5 inline-flex items-center justify-between gap-3 border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background motion-safe:transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open page
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Select a page
            </p>
            <h2 className="mt-3 font-heading text-2xl font-light leading-tight text-foreground">
              Click a card, row, or graph node.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The drawer shows backlinks, outbound links, source count, and a
              quick route into the page. Press Esc to close.
            </p>
          </div>
        )}
      </section>

      {page ? (
        <>
          <GroupedRelationList
            emptyText="No outbound links were found for this page."
            icon={<ArrowRightIcon className="size-3.5" aria-hidden />}
            labelText="Outbound links"
            onSelect={onSelect}
            pages={outboundPages}
          />
          <GroupedRelationList
            emptyText="No backlinks were found for this page."
            icon={<BookOpenIcon className="size-3.5" aria-hidden />}
            labelText="Backlinks"
            onSelect={onSelect}
            pages={backlinkPages}
          />
          {page.sourceNotes.length > 0 ? (
            <section className="border border-border/80 bg-card/70 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Source trail
              </p>
              <ol className="mt-3 space-y-3">
                {page.sourceNotes.slice(0, 3).map((note, noteIndex) => (
                  <li
                    key={`${page.slug}-source-${noteIndex}`}
                    className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      S{String(noteIndex + 1).padStart(2, "0")}
                    </span>
                    <span>{note}</span>
                  </li>
                ))}
              </ol>
              {page.sourceNotes.length > 3 ? (
                <Link
                  href={`/wiki/${page.slug}`}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground underline decoration-accent underline-offset-4"
                >
                  +{page.sourceNotes.length - 3} more on page
                  <ArrowRightIcon className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <RelationList
          emptyText="No entry points available."
          icon={<MapIcon className="size-3.5" aria-hidden />}
          labelText={
            index ? `${index.pages.length} pages available` : "Good entry points"
          }
          onSelect={onSelect}
          pages={entryPages}
        />
      )}
    </aside>
  );
}

function GroupedRelationList({
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
  if (pages.length === 0) {
    return (
      <section className="border border-border/80 bg-card/70 p-5">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {icon}
          {labelText}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {emptyText}
        </p>
      </section>
    );
  }

  const groups = groupPagesByCluster(pages);

  return (
    <section className="border border-border/80 bg-card/70">
      <p className="flex items-center gap-2 border-b border-border/80 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {labelText}
        <span className="ml-auto tabular-nums text-foreground">
          {pages.length}
        </span>
      </p>
      <div className="divide-y divide-border/80">
        {groups.map(([clusterId, clusterPages]) => (
          <div key={clusterId} className="px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {clusterLabel(clusterId)}
            </p>
            <ul className="mt-2 space-y-1.5">
              {clusterPages.slice(0, 6).map((page) => (
                <li key={page.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(page.slug)}
                    className="block w-full text-left text-sm leading-relaxed text-muted-foreground underline decoration-transparent underline-offset-4 motion-safe:transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {page.title}
                  </button>
                </li>
              ))}
              {clusterPages.length > 6 ? (
                <li className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  +{clusterPages.length - 6} more
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </section>
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
    <section className="border border-border/80 bg-card/70 p-5">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {labelText}
      </p>
      <div className="mt-3 divide-y divide-border/80">
        {pages.length > 0 ? (
          pages.slice(0, 8).map((page) => (
            <button
              key={page.slug}
              type="button"
              onClick={() => onSelect(page.slug)}
              className="block w-full py-3 text-left motion-safe:transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-medium text-foreground">{page.title}</span>
              <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
                {page.description}
              </span>
            </button>
          ))
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="border-t border-border/80 bg-card/70 p-10 text-center">
      <h2 className="font-heading text-xl font-light text-foreground">
        No pages match those filters.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Clear the filters or search a broader term.
      </p>
    </div>
  );
}
