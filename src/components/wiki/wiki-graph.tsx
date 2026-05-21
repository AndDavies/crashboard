"use client";

import Link from "next/link";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { clusterLabel } from "@/lib/public-wiki/reader-paths";
import { cn } from "@/lib/utils";

type Node = {
  id: string;
  title: string;
  cluster: string;
  role: string;
  href: string;
};

type Edge = {
  source: string;
  target: string;
};

const VISIBLE_NODE_CAP = 48;

const clusterColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--accent)",
];

function hash(input: string) {
  return Array.from(input).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function titleCase(input: string) {
  return input
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getClusterColor(cluster: string) {
  return clusterColors[hash(cluster) % clusterColors.length];
}

function roleRingIndex(role: string) {
  if (role === "hub") return 0;
  if (role === "concept") return 1;
  return 2;
}

function getRoleRadius(role: string, compact: boolean) {
  const innerRing = compact ? 64 : 96;
  const ringStep = compact ? 62 : 78;
  return innerRing + roleRingIndex(role) * ringStep;
}

function getNodeRadius(node: Node, degree: number, focused: boolean) {
  const base = node.role === "hub" ? 12 : node.role === "concept" ? 9 : 7;
  return base + Math.min(degree, 8) * 0.4 + (focused ? 4 : 0);
}

export function WikiGraph({
  nodes,
  edges,
  compact = false,
  activeNodeId: controlledActiveNodeId,
  selectedNodeId: controlledSelectedNodeId,
  focusedNodeId,
  onNodeHover,
  onNodeSelect,
  showSelectedPanel = true,
  showNodeList = true,
}: {
  nodes: Node[];
  edges: Edge[];
  compact?: boolean;
  activeNodeId?: string | null;
  selectedNodeId?: string | null;
  focusedNodeId?: string | null;
  onNodeHover?: (nodeId: string | null) => void;
  onNodeSelect?: (nodeId: string | null) => void;
  showSelectedPanel?: boolean;
  showNodeList?: boolean;
}) {
  const [internalActiveNodeId, setInternalActiveNodeId] = useState<string | null>(null);
  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<string>("all");

  const totalNodes = nodes.length;
  const visibleNodes = useMemo(() => nodes.slice(0, VISIBLE_NODE_CAP), [nodes]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [edges, visibleIds],
  );

  const selectedNodeId =
    controlledSelectedNodeId === undefined ? internalSelectedNodeId : controlledSelectedNodeId;
  const hoverNodeId =
    controlledActiveNodeId === undefined ? internalActiveNodeId : controlledActiveNodeId;
  const activeNodeId = selectedNodeId ?? hoverNodeId ?? focusedNodeId ?? null;

  const clusters = useMemo(() => {
    return Array.from(new Set(visibleNodes.map((node) => node.cluster))).toSorted(
      (a, b) => {
        if (a === "foundations") return -1;
        if (b === "foundations") return 1;
        return clusterLabel(a).localeCompare(clusterLabel(b));
      },
    );
  }, [visibleNodes]);

  const clusterIndex = useMemo(() => {
    return new Map(clusters.map((cluster, index) => [cluster, index] as const));
  }, [clusters]);

  const nodeBySlug = useMemo(() => {
    return new Map(visibleNodes.map((node) => [node.id, node] as const));
  }, [visibleNodes]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of visibleNodes) map.set(node.id, new Set());
    for (const edge of visibleEdges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    return map;
  }, [visibleEdges, visibleNodes]);

  const activeNeighbors = activeNodeId
    ? (neighbors.get(activeNodeId) ?? new Set<string>())
    : new Set<string>();
  const selectedNode = selectedNodeId
    ? visibleNodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const width = 920;
  const height = compact ? 360 : 540;
  const centerX = width / 2;
  const centerY = height / 2;

  const positions = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    if (clusters.length === 0) return out;

    const sectorSpan = (Math.PI * 2) / clusters.length;
    const buckets = new Map<string, Node[]>();
    for (const cluster of clusters) buckets.set(cluster, []);
    for (const node of visibleNodes) buckets.get(node.cluster)?.push(node);

    for (const cluster of clusters) {
      const clusterNodes = buckets.get(cluster) ?? [];
      const sortedCluster = clusterNodes.toSorted(
        (a, b) => roleRingIndex(a.role) - roleRingIndex(b.role) || a.title.localeCompare(b.title),
      );
      const byRing = new Map<number, Node[]>();
      for (const node of sortedCluster) {
        const ring = roleRingIndex(node.role);
        const existing = byRing.get(ring) ?? [];
        existing.push(node);
        byRing.set(ring, existing);
      }

      const sectorStart =
        (clusterIndex.get(cluster) ?? 0) * sectorSpan - Math.PI / 2;
      const sectorCenter = sectorStart + sectorSpan / 2;
      const ringPad = sectorSpan * 0.08;
      const ringSpan = sectorSpan - ringPad * 2;

      for (const [ring, ringNodes] of byRing) {
        const radius = getRoleRadius(ring === 0 ? "hub" : ring === 1 ? "concept" : "reference", compact);
        if (ringNodes.length === 1) {
          out.set(ringNodes[0].id, {
            x: centerX + Math.cos(sectorCenter) * radius,
            y: centerY + Math.sin(sectorCenter) * radius,
          });
          continue;
        }
        ringNodes.forEach((node, index) => {
          const t = ringNodes.length === 1 ? 0.5 : index / (ringNodes.length - 1);
          const angle = sectorStart + ringPad + t * ringSpan;
          out.set(node.id, {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          });
        });
      }
    }

    return out;
  }, [centerX, centerY, clusterIndex, clusters, compact, visibleNodes]);

  function setHover(nodeId: string | null) {
    setInternalActiveNodeId(nodeId);
    onNodeHover?.(nodeId);
  }

  function setSelected(nodeId: string | null) {
    const nextNodeId = selectedNodeId === nodeId ? null : nodeId;
    setInternalSelectedNodeId(nextNodeId);
    onNodeSelect?.(nextNodeId);
  }

  function isActiveNode(node: Node) {
    if (activeCluster !== "all" && node.cluster !== activeCluster) return false;
    if (!activeNodeId) return true;
    return node.id === activeNodeId || activeNeighbors.has(node.id);
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden border border-border/80 bg-card/70">
      <div className="flex flex-col gap-3 border-b border-border/80 px-4 py-3">
        <div>
          <p className="eyebrow">Graph</p>
          <h2 className="font-heading text-lg font-light text-foreground">
            Page relationships
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Highlight graph cluster">
          <button
            type="button"
            onClick={() => setActiveCluster("all")}
            className={cn(
              "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeCluster === "all"
                ? "border-foreground bg-foreground text-background"
                : "border-border/80 bg-background/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            All clusters
          </button>
          {clusters.map((cluster) => {
            const active = activeCluster === cluster;
            return (
              <button
                key={cluster}
                type="button"
                onClick={() => setActiveCluster(active ? "all" : cluster)}
                className={cn(
                  "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-foreground bg-card text-foreground"
                    : "border-border/80 bg-background/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                <span
                  className="size-2"
                  style={{ backgroundColor: getClusterColor(cluster) }}
                  aria-hidden
                />
                {clusterLabel(cluster)}
              </button>
            );
          })}
        </div>
        {totalNodes > VISIBLE_NODE_CAP ? (
          <p className="meta-tag">
            Showing {VISIBLE_NODE_CAP} of {totalNodes} pages
          </p>
        ) : null}
      </div>

      <div className="relative min-w-0 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="wiki-graph min-h-[20rem] w-full min-w-[40rem]"
          role="img"
          aria-label="Wiki page relationship graph"
          onMouseLeave={() => setHover(null)}
        >
          <g>
            {visibleEdges.map((edge) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              if (!source || !target) return null;
              const activeEdge =
                !activeNodeId || edge.source === activeNodeId || edge.target === activeNodeId;
              const sourceNode = nodeBySlug.get(edge.source);
              const targetNode = nodeBySlug.get(edge.target);
              const clusterVisible =
                activeCluster === "all" ||
                sourceNode?.cluster === activeCluster ||
                targetNode?.cluster === activeCluster;
              const stroke =
                sourceNode && targetNode && sourceNode.cluster === targetNode.cluster
                  ? getClusterColor(sourceNode.cluster)
                  : "currentColor";
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={stroke}
                  strokeWidth={activeEdge ? 1.6 : 0.8}
                  className={cn(
                    "wiki-graph-edge text-muted-foreground",
                    activeEdge && clusterVisible ? "opacity-70" : "opacity-[0.12]",
                  )}
                />
              );
            })}
          </g>
          {visibleNodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            const degree = neighbors.get(node.id)?.size ?? 0;
            const focused = node.id === activeNodeId;
            const visible = isActiveNode(node);
            const radius = getNodeRadius(node, degree, focused);
            const labelOffset = position.y > centerY ? radius + 16 : -(radius + 8);
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.title}, ${clusterLabel(node.cluster)}, ${degree} connected pages`}
                className={cn(
                  "wiki-graph-node cursor-pointer focus:outline-none",
                  visible ? "opacity-100" : "opacity-25",
                )}
                onMouseEnter={() => setHover(node.id)}
                onFocus={() => setHover(node.id)}
                onBlur={() => setHover(null)}
                onClick={() => setSelected(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(node.id);
                  }
                }}
              >
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={radius}
                  fill={getClusterColor(node.cluster)}
                  stroke={focused ? "var(--foreground)" : "var(--background)"}
                  strokeWidth={focused ? 3 : 4}
                />
                {focused ? (
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={radius + 8}
                    fill="none"
                    stroke={getClusterColor(node.cluster)}
                    strokeWidth="1.4"
                    className="wiki-graph-pulse"
                  />
                ) : null}
                {focused || (!compact && node.role === "hub") ? (
                  <text
                    x={position.x}
                    y={position.y + labelOffset}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium"
                  >
                    {node.title.length > 24 ? `${node.title.slice(0, 22)}…` : node.title}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {showSelectedPanel && selectedNode ? (
        <div className="border-t border-border/80 bg-background/55 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-1.5 border border-border/80 bg-background/60 px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  <span
                    className="size-2"
                    style={{ backgroundColor: getClusterColor(selectedNode.cluster) }}
                    aria-hidden
                  />
                  {clusterLabel(selectedNode.cluster)}
                </span>
                <span className="border border-border/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {titleCase(selectedNode.role)}
                </span>
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground">
                {selectedNode.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {(neighbors.get(selectedNode.id)?.size ?? 0).toLocaleString()} connected pages
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSelected(null)}
              aria-label="Clear selected graph node"
            >
              <XIcon className="size-4" aria-hidden />
            </Button>
          </div>
          <Link
            href={selectedNode.href}
            className="mt-4 inline-flex items-center gap-2 border border-border/80 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open page
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      {showNodeList ? (
        <div className="grid max-h-60 gap-px overflow-y-auto border-t border-border/80 bg-border/80 sm:grid-cols-2">
          {visibleNodes.map((node) => {
            const active = activeNodeId === node.id;
            const connected = activeNodeId ? activeNeighbors.has(node.id) : false;
            return (
              <Link
                key={node.id}
                href={node.href}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  "group flex items-center gap-2 bg-card/70 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  (active || connected) && "bg-muted/60 text-foreground",
                )}
              >
                <span
                  className="inline-block size-2 transition-transform group-hover:scale-125"
                  style={{ backgroundColor: getClusterColor(node.cluster) }}
                />
                {node.title}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
