"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PreviewCard } from "@base-ui/react/preview-card";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowRightIcon,
  ArrowUpDownIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  MapIcon,
  RouteIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
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
  { id: "paths", label: "Domains", icon: BookOpenIcon },
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

const EXPLORER_MODES: ExplorerMode[] = ["paths", "all-pages", "map"];
const SORT_VALUES: SortOption[] = [
  "cluster",
  "title",
  "sources",
  "reading",
  "links",
];

function parseMode(value: string | null): ExplorerMode {
  return value && EXPLORER_MODES.includes(value as ExplorerMode)
    ? (value as ExplorerMode)
    : "paths";
}

function parseSort(value: string | null): SortOption {
  return value && SORT_VALUES.includes(value as SortOption)
    ? (value as SortOption)
    : "cluster";
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

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
  return cluster === "foundations" ? "000-foundations" : clusterLabel(cluster);
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

function searchScore(page: PublicWikiIndexPage, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized || !matches(page, normalized)) return normalized ? -1 : 0;

  const title = page.title.toLowerCase();
  const description = page.description.toLowerCase();
  const headings = page.headings.map((heading) => heading.text).join(" ").toLowerCase();
  const sources = page.sourceNotes.join(" ").toLowerCase();
  const terms = normalized.split(/\s+/).filter(Boolean);
  let score = 0;
  if (title === normalized) score += 120;
  else if (title.startsWith(normalized)) score += 80;
  else if (title.includes(normalized)) score += 55;
  if (description.includes(normalized)) score += 24;
  for (const term of terms) {
    if (title.includes(term)) score += 18;
    if (description.includes(term)) score += 7;
    if (headings.includes(term)) score += 5;
    if (sources.includes(term)) score += 2;
  }
  return score;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();

  const [mode, setMode] = useState<ExplorerMode>(() =>
    parseMode(searchParams.get("view")),
  );
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [cluster, setCluster] = useState(() => searchParams.get("cluster") ?? "all");
  const [role, setRole] = useState(() => searchParams.get("role") ?? "all");
  const [sort, setSort] = useState<SortOption>(() =>
    parseSort(searchParams.get("sort")),
  );
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTrailId, setActiveTrailId] = useState<string | null>(null);
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
      if (deferredQuery) {
        const relevance = searchScore(b, deferredQuery) - searchScore(a, deferredQuery);
        if (relevance !== 0) return relevance;
      }
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

  const activeTrail = useMemo(
    () => readingTrails.find((trail) => trail.id === activeTrailId) ?? null,
    [activeTrailId, readingTrails],
  );
  const activeTrailStep = activeTrail
    ? activeTrail.pages.findIndex((page) => page.slug === selectedNodeId)
    : -1;

  // Keep the URL in sync so a filtered/scoped view is shareable and survives refresh.
  useEffect(() => {
    const params = new URLSearchParams();
    if (mode !== "paths") params.set("view", mode);
    if (cluster !== "all") params.set("cluster", cluster);
    if (role !== "all") params.set("role", role);
    if (sort !== "cluster") params.set("sort", sort);
    if (deferredQuery) params.set("q", deferredQuery);
    if (selectedNodeId) params.set("page", selectedNodeId);
    if (activeTrailId) params.set("trail", activeTrailId);
    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    activeTrailId,
    cluster,
    deferredQuery,
    mode,
    pathname,
    role,
    router,
    searchParams,
    selectedNodeId,
    sort,
  ]);

  // Restore a selected/trail state from the URL on first load (shareable deep links).
  useEffect(() => {
    const pageParam = searchParams.get("page");
    if (pageParam && pageBySlug.has(pageParam)) {
      setSelectedNodeId(pageParam);
      setActiveNodeId(pageParam);
    }
    const trailParam = searchParams.get("trail");
    if (trailParam) setActiveTrailId(trailParam);
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setActiveTrailId(null);
  }

  const selectPage = useCallback((slug: string | null) => {
    setSelectedNodeId(slug);
    setActiveNodeId(slug);
    setShowWholeVaultMap(false);
  }, []);

  function followTrail(trail: ReadingTrail) {
    setMode("all-pages");
    setCluster(trail.clusterId);
    setRole("all");
    setActiveTrailId(trail.id);
    selectPage(trail.pages[0]?.slug ?? null);
  }

  const goToTrailStep = useCallback(
    (nextIndex: number) => {
      if (!activeTrail) return;
      const clamped = Math.max(0, Math.min(activeTrail.pages.length - 1, nextIndex));
      selectPage(activeTrail.pages[clamped]?.slug ?? null);
    },
    [activeTrail, selectPage],
  );

  function exitTrail() {
    setActiveTrailId(null);
    selectPage(null);
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

      {activeTrail ? (
        <TrailProgress
          trail={activeTrail}
          stepIndex={activeTrailStep}
          onStep={goToTrailStep}
          onSelect={selectPage}
          onExit={exitTrail}
        />
      ) : null}

      {mode === "paths" ? (
        deferredQuery ? (
          <IndexMode
            pages={pages}
            isDesktop={isDesktop}
            relationMaps={relationMaps}
            selectedNodeId={selectedNodeId}
            selectedPage={selectedPage}
            entryPages={entryPages}
            pageBySlug={pageBySlug}
            onHover={setActiveNodeId}
            onSelect={selectPage}
          />
        ) : (
          <PathsMode
            index={index}
            isDesktop={isDesktop}
            readerPaths={readerPaths}
            readingTrails={readingTrails}
            relationMaps={relationMaps}
            pageBySlug={pageBySlug}
            selectedPage={selectedPage}
            onHover={setActiveNodeId}
            onSelect={selectPage}
            onFollowTrail={followTrail}
          />
        )
      ) : null}

      {mode === "all-pages" ? (
        <IndexMode
          pages={pages}
          isDesktop={isDesktop}
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
          cluster={cluster}
          isDesktop={isDesktop}
          onClusterFilter={setClusterFilter}
          entryPages={entryPages}
          graph={mapGraph}
          mapContext={
            showWholeVaultMap
              ? "Whole vault map"
              : selectedNodeId
                ? "Selected page neighborhood"
                : cluster !== "all"
                  ? `${clusterLabel(cluster)} cluster`
                  : "Reader guide pages"
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

      {!isDesktop ? (
        <MobilePageSheet
          open={Boolean(selectedPage)}
          onClose={() => selectPage(null)}
        >
          {selectedPage ? (
            <PageDrawer
              entryPages={[]}
              index={index}
              page={selectedPage}
              pageBySlug={pageBySlug}
              relationMaps={relationMaps}
              onClose={() => selectPage(null)}
              onSelect={selectPage}
            />
          ) : null}
        </MobilePageSheet>
      ) : null}
    </div>
  );
}

function MobilePageSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto border-t-2 border-accent bg-background p-4 shadow-[0_-18px_60px_rgba(0,0,0,0.22)] outline-none transition-transform data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TrailProgress({
  trail,
  stepIndex,
  onStep,
  onSelect,
  onExit,
}: {
  trail: ReadingTrail;
  stepIndex: number;
  onStep: (nextIndex: number) => void;
  onSelect: (slug: string | null) => void;
  onExit: () => void;
}) {
  const total = trail.pages.length;
  const currentStep = stepIndex >= 0 ? stepIndex : 0;
  const humanStep = stepIndex >= 0 ? stepIndex + 1 : 1;

  return (
    <section
      className="sticky top-16 z-30 border border-accent/40 bg-accent/5 backdrop-blur md:top-24"
      aria-label="Trail progress"
    >
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center bg-accent text-accent-foreground">
            <RouteIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">
              Following · step {humanStep} of {total}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {trail.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Trail steps">
            {trail.pages.map((page, index) => (
              <button
                key={page.slug}
                type="button"
                onClick={() => onSelect(page.slug)}
                aria-label={`Go to step ${index + 1}: ${page.title}`}
                aria-current={index === currentStep ? "step" : undefined}
                className={cn(
                  "h-1.5 w-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  index === currentStep
                    ? "bg-accent"
                    : index < currentStep
                      ? "bg-accent/50"
                      : "bg-border",
                )}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStep(currentStep - 1)}
            disabled={currentStep <= 0}
            aria-label="Previous step"
          >
            <ChevronLeftIcon className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() => onStep(currentStep + 1)}
            disabled={currentStep >= total - 1}
          >
            Next
            <ChevronRightIcon className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onExit}>
            Exit
          </Button>
        </div>
      </div>
    </section>
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
      className="border-y border-foreground/80 bg-background"
      aria-label="Explorer controls"
    >
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Browse</p>
          <div
            className="mt-2 inline-flex border border-border/80 bg-card/60"
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

        <div className="flex flex-wrap items-center gap-3">
          <span className="meta-tag">
            {pageCount.toLocaleString()} pages
          </span>
          {!showAllPageFilters && filtersDirty ? (
            <span className="meta-tag text-foreground">
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

      <div className="grid gap-4 border-t border-border/80 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem] lg:items-end">
          <label className="space-y-2">
            <span className="eyebrow flex items-center gap-2">
              <SearchIcon className="size-3.5" aria-hidden />
              Search the wiki
            </span>
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value && mode !== "all-pages") setMode("all-pages");
              }}
              placeholder="Search concepts, workflows, source notes..."
              className="border-border/80 bg-background"
            />
          </label>

          {showAllPageFilters || showMapFilter ? (
          <FilterSelect
            labelText="Cluster"
            value={cluster}
            onValueChange={setClusterFilter}
            options={clusterOptions}
          />

          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground lg:col-span-3">
              Search first, or open a domain below to browse its published pages.
            </p>
          )}

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
          ) : showMapFilter ? (
            <div className="hidden lg:block lg:col-span-2" />
          ) : null}
        </div>
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
      <span className="eyebrow flex items-center gap-2">
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
  isDesktop,
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
  isDesktop: boolean;
  onFollowTrail: (trail: ReadingTrail) => void;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  readerPaths: ReaderPathWithPages[];
  readingTrails: ReadingTrail[];
  relationMaps: RelationMaps;
  selectedPage: PublicWikiIndexPage | null;
}) {
  const showInlineDrawer = isDesktop && Boolean(selectedPage);
  const domainGroups = groupPagesByCluster(index.pages);
  return (
    <div
      className={cn(
        "grid min-w-0 gap-10",
        showInlineDrawer && "xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
      <div className="min-w-0 space-y-10">
        <section>
          <SectionHeader
            eyebrow="Knowledge domains"
            title="Browse the publication by subject."
            description="Domains stay collapsed until you need them. Search above when you already know the concept, source, or workflow you are looking for."
          />
          <div className="mt-6 border-y border-foreground/80">
            {domainGroups.map(([clusterId, clusterPages]) => {
              const sourceCount = clusterPages.reduce(
                (total, page) => total + page.sourceNotes.length,
                0,
              );
              return (
                <details key={clusterId} className="disclosure px-1 first:border-t-0">
                  <summary>
                    <span className="grid flex-1 gap-2 sm:grid-cols-[13rem_1fr_auto] sm:items-center">
                      <span className="font-heading text-xl font-semibold">
                        {clusterLabel(clusterId)}
                      </span>
                      <span className="hidden line-clamp-2 font-normal text-muted-foreground sm:block">
                        {clusterPages[0]?.description}
                      </span>
                      <span className="meta-tag whitespace-nowrap">
                        {clusterPages.length} {clusterPages.length === 1 ? "page" : "pages"} · {sourceCount} sources
                      </span>
                    </span>
                  </summary>
                  <ol className="divide-y divide-border/80 border-t border-border/80 pb-2">
                    {clusterPages.map((page) => (
                      <li key={page.slug}>
                        <Link
                          href={`/wiki/${page.slug}`}
                          className="group grid gap-2 py-4 outline-none hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(12rem,0.65fr)_minmax(0,1fr)_auto] sm:items-center"
                          onMouseEnter={() => onHover(page.slug)}
                          onMouseLeave={() => onHover(null)}
                        >
                          <span className="font-heading text-lg font-semibold text-foreground">
                            {page.title}
                          </span>
                          <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                            {page.description}
                          </span>
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                            Read
                            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </div>
        </section>

        <details className="disclosure border-b border-border/80">
          <summary>Curated reading guides</summary>
          <div className="grid gap-px border border-border/80 bg-border/80 md:grid-cols-2 lg:grid-cols-3">
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
        </details>

        <details className="disclosure border-b border-border/80">
          <summary>Generated reading trails</summary>
          <div className="grid gap-px border border-border/80 bg-border/80 md:grid-cols-2">
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
        </details>
      </div>

      {showInlineDrawer ? (
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
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 font-heading text-3xl font-semibold text-foreground">
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
        <p className="eyebrow">Reader guide</p>
        <h3 className="font-heading text-2xl font-semibold leading-tight text-foreground">
          {path.title}
        </h3>
        <p className="text-base leading-relaxed text-foreground">{path.promise}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {path.description}
        </p>

        {visibleSupporting.length > 0 ? (
          <div className="mt-auto pt-2">
            <p className="eyebrow">Related pages</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                <span className="meta-tag border border-border/80 bg-background/60 px-2.5 py-1">
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
            Read {primary.title}
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
  cluster,
  entryPages,
  graph,
  isDesktop,
  mapContext,
  onClusterFilter,
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
  cluster: string;
  entryPages: PublicWikiIndexPage[];
  graph: PublicWikiIndex["graph"];
  isDesktop: boolean;
  mapContext: string;
  onClusterFilter: (cluster: string) => void;
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
    <div
      className={cn(
        "grid min-w-0 gap-10",
        isDesktop && "xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
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
                <span className="eyebrow block">Tap to reveal</span>
                <span className="mt-2 block font-heading text-2xl font-semibold text-foreground">
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
            clusterFilter={cluster}
            onClusterFilter={onClusterFilter}
            onNodeHover={onHover}
            onNodeSelect={onSelect}
            showSelectedPanel={false}
            showNodeList={false}
          />
        </div>
      </section>

      {isDesktop ? (
        <PageDrawer
          entryPages={entryPages}
          index={null}
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
      {/* Primary action: the whole header starts the trail. */}
      <button
        type="button"
        onClick={() => onFollowTrail(trail)}
        className="group/lead flex flex-col gap-3 p-5 text-left outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow">
            Reading trail · {trail.pages.length} steps
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            Start trail
            <ArrowRightIcon
              className="size-4 motion-safe:transition-transform motion-safe:group-hover/lead:translate-x-1"
              aria-hidden
            />
          </span>
        </div>
        <h3 className="font-heading text-2xl font-semibold leading-tight text-foreground motion-safe:transition-colors group-hover/lead:text-accent">
          {trail.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {trail.description}
        </p>
      </button>

      {/* Secondary: peek at the individual steps. */}
      <div className="mt-auto border-t border-border/80 px-5 pb-5 pt-4">
        <p className="meta-tag">Steps to preview</p>
        <ol className="mt-3 grid gap-px border border-border/80 bg-border/80 sm:grid-cols-2 xl:grid-cols-4">
          {trail.pages.map((page, stepIndex) => (
            <li key={page.slug} className="bg-card/70">
              <RouteStep
                backlinksCount={relationMaps.backlinks.get(page.slug)?.length ?? 0}
                index={stepIndex}
                onHover={onHover}
                onSelect={onSelect}
                outboundCount={relationMaps.outbound.get(page.slug)?.length ?? 0}
                page={page}
              />
            </li>
          ))}
        </ol>
      </div>
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
    <div
      className="group/step h-full"
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <WikiPagePreview
        page={page}
        backlinksCount={backlinksCount}
        outboundCount={outboundCount}
        side="bottom"
      >
        <button
          type="button"
          onClick={() => onSelect(page.slug)}
          className="relative flex h-full w-full flex-col gap-1.5 p-3 text-left motion-safe:transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent opacity-0 transition-opacity duration-150 group-hover/step:opacity-100 group-focus-within/step:opacity-100"
          />
          <span className="ordinal">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="line-clamp-2 text-xs font-medium leading-snug text-muted-foreground">
            {page.title}
          </span>
        </button>
      </WikiPagePreview>
    </div>
  );
}

function IndexMode({
  entryPages,
  isDesktop,
  onHover,
  onSelect,
  pageBySlug,
  pages,
  relationMaps,
  selectedNodeId,
  selectedPage,
}: {
  entryPages: PublicWikiIndexPage[];
  isDesktop: boolean;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
  pageBySlug: Map<string, PublicWikiIndexPage>;
  pages: PublicWikiIndexPage[];
  relationMaps: RelationMaps;
  selectedNodeId: string | null;
  selectedPage: PublicWikiIndexPage | null;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-10",
        isDesktop && "xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
      <section className="min-w-0 border border-border/80">
        <div className="hidden grid-cols-[minmax(13rem,1.2fr)_9rem_8rem_5rem_5rem_5rem] border-b border-border/80 bg-muted/40 px-4 py-3 lg:grid">
          <span className="eyebrow">Page</span>
          <span className="eyebrow">Cluster</span>
          <span className="eyebrow">Role</span>
          <span className="eyebrow text-right">Sources</span>
          <span className="eyebrow text-right">Links</span>
          <span className="eyebrow text-right">Open</span>
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

      {isDesktop ? (
        <PageDrawer
          entryPages={entryPages}
          index={null}
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
        "group/row grid gap-y-2 gap-x-3 bg-card/70 px-4 py-4 motion-safe:transition-colors hover:bg-card lg:grid-cols-[minmax(13rem,1.2fr)_9rem_8rem_5rem_5rem_5rem] lg:items-center",
        active && "border-l-2 border-accent bg-card pl-[calc(1rem-2px)]",
      )}
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="min-w-0">
        <WikiPagePreview
          page={page}
          backlinksCount={backlinksCount}
          outboundCount={outboundCount}
          side="bottom"
        >
          <button
            type="button"
            onClick={() => onSelect(page.slug)}
            className="block w-full text-left font-heading text-xl font-semibold leading-tight text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {page.title}
          </button>
        </WikiPagePreview>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground lg:hidden">
          {page.description}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground lg:hidden">
          <div className="flex items-center gap-1.5">
            <dt className="meta-tag">Cluster</dt>
            <dd className="text-foreground">{clusterLabel(page.cluster)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="meta-tag">Role</dt>
            <dd className="text-foreground">{label(page.role)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="meta-tag">Sources</dt>
            <dd className="tabular-nums text-foreground">{page.sourceNotes.length}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="meta-tag">Links</dt>
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
      className="group/chip inline-flex"
      onMouseEnter={() => onHover(page.slug)}
      onMouseLeave={() => onHover(null)}
    >
      <WikiPagePreview
        page={page}
        backlinksCount={backlinksCount}
        outboundCount={outboundCount}
        side="top"
      >
        <button
          type="button"
          onClick={() => onSelect(page.slug)}
          className="border border-border/80 bg-background/70 px-2.5 py-1 text-left text-xs font-medium text-muted-foreground motion-safe:transition-colors hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {prefix ? <span className="mr-1 text-foreground">{prefix}</span> : null}
          {page.title}
        </button>
      </WikiPagePreview>
    </span>
  );
}

/**
 * A portaled, collision-aware preview shown on hover/focus of a page trigger.
 * Replaces the old CSS-only absolute popovers (which were trapped behind
 * sibling cards by transform-based stacking contexts) and is itself hoverable.
 */
function WikiPagePreview({
  page,
  backlinksCount,
  outboundCount,
  side = "bottom",
  children,
}: {
  page: PublicWikiIndexPage;
  backlinksCount: number;
  outboundCount: number;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger delay={140} closeDelay={120} render={children} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          side={side}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <PreviewCard.Popup className="w-72 max-w-[calc(100vw-2rem)] border border-border/80 bg-background/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] outline-none backdrop-blur data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-safe:transition-opacity">
            <p className="meta-tag">
              {clusterLabel(page.cluster)} · {label(page.role)}
            </p>
            <p className="mt-2 font-heading text-lg font-semibold leading-tight text-foreground">
              {page.title}
            </p>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {page.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <span className="meta-tag">{page.sourceNotes.length} sources</span>
              <span className="meta-tag">{outboundCount} outbound</span>
              <span className="meta-tag">{backlinksCount} backlinks</span>
            </div>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
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
                <p className="eyebrow">Selected page</p>
                <h2 className="mt-3 font-heading text-3xl font-semibold leading-tight text-foreground">
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

            <p className="meta-tag mt-3">
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
            <p className="eyebrow">Knowledge index</p>
            <h2 className="mt-3 font-heading text-2xl font-semibold leading-tight text-foreground">
              Source-backed pages, connected by topic and evidence.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Open a page directly or review its related notes, source count,
              and position in the knowledge graph.
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
              <p className="eyebrow">Source trail</p>
              <ol className="mt-3 space-y-3">
                {page.sourceNotes.slice(0, 3).map((note, noteIndex) => (
                  <li
                    key={`${page.slug}-source-${noteIndex}`}
                    className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="ordinal mt-0.5">
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
        <p className="eyebrow flex items-center gap-2">
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
      <p className="eyebrow flex items-center gap-2 border-b border-border/80 px-5 py-3">
        {icon}
        {labelText}
        <span className="ml-auto tabular-nums text-foreground">
          {pages.length}
        </span>
      </p>
      <div className="divide-y divide-border/80">
        {groups.map(([clusterId, clusterPages]) => (
          <div key={clusterId} className="px-5 py-3">
            <p className="eyebrow">{clusterLabel(clusterId)}</p>
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
                <li className="meta-tag">+{clusterPages.length - 6} more</li>
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
      <p className="eyebrow flex items-center gap-2">
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
      <h2 className="font-heading text-xl font-semibold text-foreground">
        No pages match those filters.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Clear the filters or search a broader term.
      </p>
    </div>
  );
}
