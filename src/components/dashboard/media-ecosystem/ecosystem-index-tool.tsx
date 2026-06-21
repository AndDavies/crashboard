"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BoxesIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  DatabaseIcon,
  FileJsonIcon,
  FolderSearchIcon,
  ImageIcon,
  LayersIcon,
  SearchIcon,
  ServerIcon,
  SparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  EcosystemCatalog,
  PodInventory,
  PodInventoryItem,
} from "@/lib/media-ecosystem/types";

type SourceFilter =
  | "all"
  | "workflow"
  | "pose"
  | "identity"
  | "model"
  | "pod-workflow"
  | "pod-pose"
  | "pod-model";

type IndexItem = {
  id: string;
  title: string;
  path: string;
  kind: SourceFilter;
  label: string;
  meta: string[];
  score?: string;
};

type Props = {
  catalog: EcosystemCatalog;
  podInventory: PodInventory;
};

const FILTER_LABELS: Record<SourceFilter, string> = {
  all: "All",
  workflow: "Workflows",
  pose: "OpenPose",
  identity: "Identity",
  model: "Models",
  "pod-workflow": "Pod workflows",
  "pod-pose": "Pod poses",
  "pod-model": "Pod models",
};

const NEXT_POSE_DIRECTIONS = [
  {
    title: "Reclined Odalisque",
    verdict: "Best next direction",
    pose: "Media_Creation_Favourites/openpose/reclined_odalisque_side_recline_openpose_896x1536.png",
    workflow:
      "Media_Creation/Favourites/05_openpose_art_batch/Avery_OpenPose_Erotic_Art_2026_06_21/Avery_OpenPose_Erotic_Art_10_reclined_odalisque_side_recline_openpose_896x1536_api.json",
    why:
      "Most promising non-standing, non-yoga branch. It keeps the warm wet-beach look you liked while avoiding the hardest feet/full-supine geometry problems.",
    settings:
      "Juggernaut XL v9, NudeXL 0.55, Canopus 0.90, SDXL OpenPose 0.82 to 0.95, 896x1536, seed 20260621090010, 12 steps, CFG 4.7, dpmpp_2m/karras.",
  },
  {
    title: "Reclined Elbow Prop",
    verdict: "Best natural lounge variant",
    pose: "Media_Creation_Favourites/openpose/reclined_elbow_prop_bent_knee_openpose_896x1536.png",
    workflow:
      "Media_Creation/Favourites/05_openpose_art_batch/Avery_OpenPose_Erotic_Art_2026_06_21/Avery_OpenPose_Erotic_Art_11_reclined_elbow_prop_bent_knee_openpose_896x1536_api.json",
    why:
      "Good candidate for moving from beach repetition into bed, towel, window-light, or studio-floor scenes. The pose is easier than the yoga pose but still gives a full-body composition.",
    settings:
      "Same batch stack: Juggernaut XL v9, NudeXL 0.55, Canopus 0.90, SDXL OpenPose 0.82 to 0.95, 896x1536, seed 20260621090011, 12 steps, CFG 4.7.",
  },
  {
    title: "Kneeling Hair Tousle",
    verdict: "Best mood, not control quality",
    pose: "Media_Creation_Favourites/openpose/kneeling_wide_knees_hair_tousle_leanback_openpose_896x1536.png",
    workflow:
      "Media_Creation/Favourites/05_openpose_art_batch/Avery_OpenPose_Erotic_Art_2026_06_21/Avery_OpenPose_Erotic_Art_16b_kneeling_wide_hair_tousle_strong_control_api.json",
    why:
      "The strongest hair, light, and sensual mood signal. Keep it as an inspiration/reference branch, but do not invest more until the geometry source is better.",
    settings:
      "Juggernaut XL v9, NudeXL 0.55, Canopus 0.90, SDXL OpenPose 1.05 to 1.00, 896x1536, seed 20260621090116, 16 steps, CFG 4.8.",
  },
] as const;

function formatDate(input: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(input));
}

function isPodPose(item: PodInventoryItem) {
  return /openpose|pose|canny|depth|silhouette|outline/i.test(
    `${item.name} ${item.relative_path}`,
  );
}

function shortPath(path: string) {
  return path
    .replace(/^\/Users\/andrewdavies\/Documents\/Media Creation\//, "")
    .replace(/^\/workspace\/ComfyUI\/input\//, "input/")
    .replace(/^\/workspace\/ComfyUI\/user\/default\/workflows\//, "workflows/")
    .replace(/^\/workspace\/ComfyUI-Shared\/models\//, "shared-models/");
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Copy path"
      onClick={() => void copy()}
    >
      {copied ? (
        <CheckCircle2Icon className="size-3.5 text-accent" aria-hidden />
      ) : (
        <ClipboardIcon className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

function StatBlock({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
}) {
  return (
    <div className="border border-border/80 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 font-heading text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

function IndexRow({ item }: { item: IndexItem }) {
  return (
    <article className="grid gap-3 border border-border/80 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={item.kind.startsWith("pod") ? "secondary" : "outline"}>
              {item.label}
            </Badge>
            {item.score ? <Badge variant="secondary">{item.score}</Badge> : null}
          </div>
          <h3 className="mt-2 font-heading text-base font-semibold leading-snug">
            {item.title}
          </h3>
        </div>
      </div>

      {item.meta.length ? (
        <div className="flex flex-wrap gap-1.5">
          {item.meta.slice(0, 5).map((meta) => (
            <span
              key={meta}
              className="border border-border/70 bg-background px-2 py-1 text-xs text-muted-foreground"
            >
              {meta}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <code className="min-w-0 flex-1 break-all bg-muted/50 px-2 py-1">
          {shortPath(item.path)}
        </code>
        <CopyButton value={item.path} />
      </div>
    </article>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: (typeof NEXT_POSE_DIRECTIONS)[number];
}) {
  return (
    <article className="grid gap-3 border border-accent/30 bg-accent/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="secondary">{recommendation.verdict}</Badge>
          <h3 className="mt-2 font-heading text-lg font-semibold tracking-tight">
            {recommendation.title}
          </h3>
        </div>
        <SparklesIcon className="size-4 text-accent" aria-hidden />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {recommendation.why}
      </p>
      <div className="grid gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 font-semibold tracking-wide text-muted-foreground uppercase">
            Pose
          </span>
          <code className="min-w-0 flex-1 break-all bg-background/70 px-2 py-1">
            {recommendation.pose}
          </code>
          <CopyButton value={recommendation.pose} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 font-semibold tracking-wide text-muted-foreground uppercase">
            Graph
          </span>
          <code className="min-w-0 flex-1 break-all bg-background/70 px-2 py-1">
            {recommendation.workflow}
          </code>
          <CopyButton value={recommendation.workflow} />
        </div>
      </div>
      <p className="border-t border-accent/20 pt-3 text-xs leading-relaxed text-muted-foreground">
        {recommendation.settings}
      </p>
    </article>
  );
}

export function EcosystemIndexTool({ catalog, podInventory }: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");

  const podPoseAssets = useMemo(
    () => podInventory.pod_input_assets.filter(isPodPose),
    [podInventory.pod_input_assets],
  );

  const items = useMemo<IndexItem[]>(() => {
    const workflowItems = catalog.promoted_workflows.map((workflow) => ({
      id: `workflow:${workflow.path}`,
      title: workflow.name,
      path: workflow.path,
      kind: "workflow" as const,
      label: "Workflow",
      score: workflow.status,
      meta: [
        workflow.modality,
        workflow.use_case,
        workflow.checkpoints,
        workflow.loras,
        workflow.controlnets,
      ].filter(Boolean),
    }));

    const poseItems = catalog.pose_assets.map((asset) => ({
      id: `pose:${asset.path}`,
      title: asset.name,
      path: asset.path,
      kind: "pose" as const,
      label: "OpenPose",
      meta: [asset.dimensions, asset.category].filter(Boolean),
    }));

    const identityItems = catalog.identity_assets.map((asset) => ({
      id: `identity:${asset.path}`,
      title: asset.name,
      path: asset.path,
      kind: "identity" as const,
      label: "Identity",
      meta: [asset.dimensions, asset.category].filter(Boolean),
    }));

    const modelItems = catalog.model_cards.map((model) => ({
      id: `model:${model.path}`,
      title: model.name,
      path: model.path,
      kind: "model" as const,
      label: "Model",
      meta: [model.category, model.size].filter(Boolean),
    }));

    const podWorkflowItems = podInventory.pod_workflows.map((item) => ({
      id: `pod-workflow:${item.pod_path}`,
      title: item.name,
      path: item.pod_path,
      kind: "pod-workflow" as const,
      label: "Pod workflow",
      meta: [item.relative_path, item.size, item.modified],
    }));

    const podPoseItems = podPoseAssets.map((item) => ({
      id: `pod-pose:${item.pod_path}`,
      title: item.name,
      path: item.pod_path,
      kind: "pod-pose" as const,
      label: "Pod pose",
      meta: [item.relative_path, item.size, item.modified],
    }));

    const podModelItems = [
      ...podInventory.pod_models,
      ...podInventory.pod_shared_models,
    ].map((item) => ({
      id: `pod-model:${item.pod_path}`,
      title: item.name,
      path: item.pod_path,
      kind: "pod-model" as const,
      label: "Pod model",
      meta: [item.relative_path, item.root, item.size],
    }));

    return [
      ...workflowItems,
      ...poseItems,
      ...identityItems,
      ...modelItems,
      ...podWorkflowItems,
      ...podPoseItems,
      ...podModelItems,
    ];
  }, [catalog, podInventory, podPoseAssets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (source !== "all" && item.kind !== source) return false;
      if (!q) return true;
      return [item.title, item.path, item.label, item.score, ...item.meta]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, source]);

  return (
    <div className="space-y-6">
      <section className="grid gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Media Creation</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
              ComfyUI ecosystem index
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Searchable snapshot of workflows, OpenPose references, identity
              images, models, LoRAs, prompt templates, and pod-visible assets.
              Refresh the source index in Media Creation, then sync this page.
            </p>
          </div>
          <div className="grid gap-1 text-right text-xs text-muted-foreground">
            <span>Catalog {formatDate(catalog.generated_at)}</span>
            <span>Pod {formatDate(podInventory.scanned_at)}</span>
            <span>{catalog.project_root}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatBlock
            label="Workflows"
            value={catalog.promoted_workflows.length}
            icon={BoxesIcon}
          />
          <StatBlock label="OpenPose" value={catalog.pose_assets.length} icon={ImageIcon} />
          <StatBlock label="Models" value={catalog.model_cards.length} icon={DatabaseIcon} />
          <StatBlock label="Pod poses" value={podPoseAssets.length} icon={ServerIcon} />
        </div>

        <div className="grid gap-3 border border-border/80 bg-card p-4">
          <div className="flex items-center gap-2">
            <FileJsonIcon className="size-4 text-muted-foreground" aria-hidden />
            <h3 className="font-heading text-base font-semibold">Refresh contract</h3>
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
            <code className="break-all bg-muted/50 px-3 py-2">
              cd /Users/andrewdavies/Documents/Media\ Creation && python3
              14_ComfyUI_Ecosystem_Index/scripts/refresh_ecosystem_index.py
            </code>
            <code className="break-all bg-muted/50 px-3 py-2">
              cd /Users/andrewdavies/Projects/Crashboard && npm run
              media:ecosystem
            </code>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold tracking-tight">
            Recommended next pose directions
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Best alternatives to the standing beach and yoga branches, based on
            the saved pod batch and the look you kept selecting.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {NEXT_POSE_DIRECTIONS.map((recommendation) => (
            <RecommendationCard
              key={recommendation.title}
              recommendation={recommendation}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3 border border-border/80 bg-card p-4">
        <div className="flex items-center gap-2">
          <FolderSearchIcon className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="font-heading text-base font-semibold">Ecosystem search</h3>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_13rem]">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Search
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="workflow, pose, model, LoRA, pod path..."
                className="pl-8"
              />
            </div>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Source
            <select
              value={source}
              onChange={(event) => setSource(event.currentTarget.value as SourceFilter)}
              className="h-9 border border-border/80 bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {Object.entries(FILTER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight">
              Search results
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {filtered.length} of {items.length} indexed entries.
            </p>
          </div>
          <Badge variant={filtered.length ? "outline" : "destructive"}>
            {filtered.length}
          </Badge>
        </div>
        <div className={cn("grid gap-4", filtered.length > 1 && "xl:grid-cols-2")}>
          {filtered.slice(0, 80).map((item) => (
            <IndexRow key={item.id} item={item} />
          ))}
          {filtered.length > 80 ? (
            <div className="border border-border/80 bg-card p-4 text-sm text-muted-foreground">
              Showing the first 80 matches. Narrow the search to inspect more precisely.
            </div>
          ) : null}
          {!filtered.length ? (
            <div className="border border-border/80 bg-card p-6 text-sm text-muted-foreground">
              No ecosystem entries match the current filters.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="font-heading text-lg font-semibold tracking-tight">
          Prompt generator templates
        </h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {catalog.prompt_templates.map((template) => (
            <article
              key={template.id}
              className="grid gap-3 border border-border/80 bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline">{template.id}</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {template.description}
                  </p>
                </div>
                <LayersIcon className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="grid gap-2 text-xs">
                <p className="font-semibold tracking-wide text-muted-foreground uppercase">
                  Positive
                </p>
                <code className="whitespace-pre-wrap bg-muted/50 px-3 py-2 leading-relaxed">
                  {template.positive_template}
                </code>
                <p className="font-semibold tracking-wide text-muted-foreground uppercase">
                  Negative
                </p>
                <code className="whitespace-pre-wrap bg-muted/50 px-3 py-2 leading-relaxed">
                  {template.negative_template}
                </code>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
