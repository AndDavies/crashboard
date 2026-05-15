"use client";

import Link from "next/link";
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

function label(input: string) {
  return input
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getClusterColor(cluster: string) {
  return clusterColors[hash(cluster) % clusterColors.length];
}

function getRoleRadius(role: string, compact: boolean) {
  if (role === "hub") return compact ? 48 : 76;
  if (role === "concept") return compact ? 104 : 154;
  return compact ? 152 : 224;
}

function getNodeRadius(node: Node, degree: number, focused: boolean) {
  const base = node.role === "hub" ? 13 : node.role === "concept" ? 10 : 8;
  return base + Math.min(degree, 8) * 0.45 + (focused ? 4 : 0);
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
}: {
  nodes: Node[];
  edges: Edge[];
  compact?: boolean;
  activeNodeId?: string | null;
  selectedNodeId?: string | null;
  focusedNodeId?: string | null;
  onNodeHover?: (nodeId: string | null) => void;
  onNodeSelect?: (nodeId: string | null) => void;
}) {
  const [internalActiveNodeId, setInternalActiveNodeId] = useState<string | null>(null);
  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<string>("all");

  const visibleNodes = useMemo(() => nodes.slice(0, compact ? 48 : 48), [compact, nodes]);
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
    return Array.from(new Set(visibleNodes.map((node) => node.cluster))).toSorted();
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

  const activeNeighbors = activeNodeId ? (neighbors.get(activeNodeId) ?? new Set<string>()) : new Set<string>();
  const selectedNode = selectedNodeId ? visibleNodes.find((node) => node.id === selectedNodeId) : null;
  const width = 920;
  const height = compact ? 340 : 540;
  const centerX = width / 2;
  const centerY = height / 2;

  const positions = useMemo(() => {
    const byRole = new Map<string, Node[]>();
    for (const node of visibleNodes) {
      const role = node.role === "hub" || node.role === "concept" ? node.role : "reference";
      byRole.set(role, [...(byRole.get(role) ?? []), node]);
    }

    const out = new Map<string, { x: number; y: number }>();
    for (const [role, roleNodes] of byRole) {
      const sorted = roleNodes.toSorted((a, b) => `${a.cluster}-${a.title}`.localeCompare(`${b.cluster}-${b.title}`));
      sorted.forEach((node, index) => {
        const angle =
          (Math.PI * 2 * index) / Math.max(sorted.length, 1) -
          Math.PI / 2 +
          (hash(node.cluster) % 17) * 0.018;
        const radius = getRoleRadius(role, compact);
        out.set(node.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });
      });
    }
    return out;
  }, [centerX, centerY, compact, visibleNodes]);

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
    <div className="overflow-hidden rounded-lg border border-border/80 bg-card/75 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Graph
          </p>
          <h2 className="font-heading text-base font-semibold text-foreground">
            Page relationships
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Highlight graph cluster">
          <button
            type="button"
            onClick={() => setActiveCluster("all")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeCluster === "all"
                ? "border-primary/40 bg-primary text-primary-foreground"
                : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            All
          </button>
          {clusters.map((cluster) => (
            <button
              key={cluster}
              type="button"
              onClick={() => setActiveCluster(activeCluster === cluster ? "all" : cluster)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeCluster === cluster
                  ? "border-primary/40 bg-muted text-foreground"
                  : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: getClusterColor(cluster) }}
                aria-hidden
              />
              {label(cluster)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="wiki-graph min-h-[20rem] w-full min-w-[44rem]"
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
              const clusterVisible =
                activeCluster === "all" ||
                visibleNodes.find((node) => node.id === edge.source)?.cluster === activeCluster ||
                visibleNodes.find((node) => node.id === edge.target)?.cluster === activeCluster;
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="currentColor"
                  strokeWidth={activeEdge ? 1.8 : 0.9}
                  className={cn(
                    "wiki-graph-edge text-muted-foreground",
                    activeEdge && clusterVisible ? "opacity-70" : "opacity-12",
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
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.title}, ${label(node.cluster)}, ${degree} connected pages`}
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
                  r={getNodeRadius(node, degree, focused)}
                  fill={getClusterColor(node.cluster)}
                  stroke={focused ? "var(--foreground)" : "var(--background)"}
                  strokeWidth={focused ? 3 : 4}
                />
                {focused ? (
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={getNodeRadius(node, degree, focused) + 8}
                    fill="none"
                    stroke={getClusterColor(node.cluster)}
                    strokeWidth="1.4"
                    className="wiki-graph-pulse"
                  />
                ) : null}
                {focused || (!compact && node.role === "hub") ? (
                  <text
                    x={position.x}
                    y={position.y + getNodeRadius(node, degree, focused) + 16}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium"
                  >
                    {node.title.length > 24 ? `${node.title.slice(0, 22)}...` : node.title}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNode ? (
        <div className="border-t border-border/70 bg-background/55 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {label(selectedNode.cluster)}
                </span>
                <span className="rounded-full border border-border/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {label(selectedNode.role)}
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
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border/80 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open page
            <ArrowUpRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      <div className="grid max-h-60 gap-1 overflow-y-auto border-t border-border/70 p-3 sm:grid-cols-2">
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
                "group rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                (active || connected) && "bg-muted/60 text-foreground",
              )}
            >
              <span
                className="mr-2 inline-block size-2 rounded-full transition-transform group-hover:scale-125"
                style={{ backgroundColor: getClusterColor(node.cluster) }}
              />
              {node.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
