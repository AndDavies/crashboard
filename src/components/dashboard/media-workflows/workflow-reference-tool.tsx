"use client";

import { useMemo, useState } from "react";
import {
  BoxesIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  FilterIcon,
  MonitorIcon,
  SearchIcon,
  ServerIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  MediaWorkflowCatalog,
  MediaWorkflowEntry,
  MediaWorkflowTask,
} from "@/lib/media-workflows/types";

type FilterValue = "all";

type Props = {
  catalog: MediaWorkflowCatalog;
};

const TASK_LABELS: Record<MediaWorkflowTask, string> = {
  text2img: "Text2img",
  openpose: "OpenPose",
  img2img: "Img2img",
  inpaint: "Inpaint",
  "upscale-export": "Export",
  i2v: "I2V",
  "first-last-frame": "FLF",
  interpolation: "Interpolation",
  reference: "Reference",
};

const SOURCE_LABELS: Record<MediaWorkflowEntry["sourceSet"], string> = {
  proven: "Proven",
  good: "Good",
  favourites: "Favourites",
  "runpod-smoke": "Pod Smoke",
  reference: "Reference",
};

function unique<T extends string>(items: T[]) {
  return [...new Set(items)].sort();
}

function formatDate(input: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(input));
}

function displayPath(path: string) {
  return path.replace(/^04_Workflows\//, "").replace(/^13_RunPod_Pilot\//, "Pod/");
}

function fileName(value: string | null | undefined) {
  if (!value) return null;
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function bestOpenPoseOrSource(workflow: MediaWorkflowEntry) {
  const openpose =
    workflow.imageInputs.find((input) => /openpose|pose/i.test(input)) ??
    workflow.imageInputs[0];

  if (openpose) return fileName(openpose);
  if (workflow.task === "text2img") return "None - text only";
  if (workflow.task === "upscale-export") return "Accepted source image";
  return "Workflow-specific source";
}

function settingSummary(workflow: MediaWorkflowEntry) {
  const p = workflow.parameters;
  const pieces: string[] = [];
  const model = fileName(workflow.models[0]);
  const loras = workflow.loras
    .map((lora) => {
      const name = fileName(lora);
      if (name === "NudeXL.safetensors" && typeof p.lora_strength_model !== "undefined") {
        return `${name} ${p.lora_strength_model}`;
      }
      return name;
    })
    .filter(Boolean);

  if (model) pieces.push(model);
  if (loras.length) pieces.push(`LoRA: ${loras.join(", ")}`);
  if (typeof p.width !== "undefined" && typeof p.height !== "undefined") {
    pieces.push(`${p.width}x${p.height}`);
  }
  if (typeof p.seed !== "undefined") pieces.push(`seed ${p.seed}`);
  if (typeof p.steps !== "undefined") pieces.push(`${p.steps} steps`);
  if (typeof p.cfg !== "undefined") pieces.push(`CFG ${p.cfg}`);
  if (typeof p.denoise !== "undefined") pieces.push(`denoise ${p.denoise}`);
  if (typeof p.control_strength !== "undefined") {
    pieces.push(
      `OpenPose ${p.control_strength}${
        typeof p.control_end !== "undefined" ? ` to ${p.control_end}` : ""
      }`,
    );
  }
  if (typeof p.sampler !== "undefined") {
    pieces.push(
      `${p.sampler}${typeof p.scheduler !== "undefined" ? `/${p.scheduler}` : ""}`,
    );
  }

  return pieces.length ? pieces.join(" · ") : "Workflow-specific settings";
}

function detailsSummary(workflow: MediaWorkflowEntry) {
  return [workflow.useWhen, workflow.whyGood].filter(Boolean).join(" ");
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

function SelectFilter({
  label,
  value,
  values,
  onChange,
  labels,
}: {
  label: string;
  value: string;
  values: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-9 border border-border/80 bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <option value="all">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {labels?.[item] ?? item}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatBlock({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof BoxesIcon;
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

function WorkflowCard({ workflow }: { workflow: MediaWorkflowEntry }) {
  const openposeOrSource = bestOpenPoseOrSource(workflow);
  const settings = settingSummary(workflow);
  const details = detailsSummary(workflow);

  return (
    <article className="grid gap-3 border border-border/80 bg-card p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(18rem,1.4fr)_minmax(16rem,1.2fr)_minmax(12rem,0.9fr)] lg:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={
                workflow.sourceSet === "proven" || workflow.sourceSet === "runpod-smoke"
                  ? "secondary"
                  : "outline"
              }
            >
              {SOURCE_LABELS[workflow.sourceSet]}
            </Badge>
            <Badge variant="outline">{TASK_LABELS[workflow.task]}</Badge>
          </div>
          <h3 className="font-heading text-base font-semibold leading-snug text-foreground">
            {workflow.title}
          </h3>
          <code className="block break-all bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            {displayPath(workflow.path)}
          </code>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Details
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{details}</p>
          {workflow.notes[0] ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {workflow.notes[0]}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Settings
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{settings}</p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Best OpenPose / Source
          </p>
          <p className="mt-1 break-all font-mono text-xs leading-relaxed text-foreground">
            {openposeOrSource}
          </p>
          {workflow.cloudPath ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                {workflow.cloudPath}
              </code>
              <CopyButton value={workflow.cloudPath} />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function WorkflowReferenceTool({ catalog }: Props) {
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState<"all" | MediaWorkflowEntry["media"]>("all");
  const [task, setTask] = useState<FilterValue | MediaWorkflowTask>("all");
  const [source, setSource] = useState<FilterValue | MediaWorkflowEntry["sourceSet"]>("proven");

  const mediaValues = useMemo(
    () => unique(catalog.workflows.map((workflow) => workflow.media)),
    [catalog.workflows],
  );
  const taskValues = useMemo(
    () => unique(catalog.workflows.map((workflow) => workflow.task)),
    [catalog.workflows],
  );
  const sourceValues = useMemo(
    () => unique(catalog.workflows.map((workflow) => workflow.sourceSet)),
    [catalog.workflows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.workflows.filter((workflow) => {
      if (media !== "all" && workflow.media !== media) return false;
      if (task !== "all" && workflow.task !== task) return false;
      if (source !== "all" && workflow.sourceSet !== source) return false;
      if (!q) return true;
      return [
        workflow.title,
        workflow.path,
        workflow.status,
        workflow.useWhen,
        workflow.whyGood,
        ...workflow.inputs,
        ...workflow.models,
        ...workflow.controlModels,
        ...workflow.loras,
        ...workflow.imageInputs,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [catalog.workflows, media, query, source, task]);

  const pinned = useMemo(
    () =>
      catalog.workflows.filter((workflow) =>
        [
          "sdxl-photoreal-openpose-production-current-v18-api.json",
          "openpose_field_boudoir_cyber_nudexl_no_canopus_TRY_THIS_ONE_api.json",
          "openpose_field_arch_boudoir_cyber_nudexl_ACCEPTED_K_api.json",
          "img2img_field_arch_boudoir_K_realism_polish_d140_ACCEPTED_api.json",
          "openpose_avery_yoga_current_best_api.json",
        ].some((name) => workflow.path.endsWith(name)),
      ),
    [catalog.workflows],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Media Creation</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
              Workflow reference
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Current map of the local and RunPod-visible ComfyUI workflows,
              what each one is for, what it needs as input, and what made it worth keeping.
            </p>
          </div>
          <div className="grid gap-1 text-right text-xs text-muted-foreground">
            <span>Generated {formatDate(catalog.generatedAt)}</span>
            <span>{catalog.sourceRoot}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatBlock
            label="Workflows"
            value={catalog.summary.workflowCount}
            icon={BoxesIcon}
          />
          <StatBlock
            label="Proven"
            value={catalog.summary.provenWorkflowCount ?? 0}
            icon={CheckCircle2Icon}
          />
          <StatBlock
            label="Pod Smoke"
            value={catalog.summary.podSmokeWorkflowCount}
            icon={MonitorIcon}
          />
          <StatBlock
            label="Models"
            value={catalog.models.length}
            icon={ServerIcon}
          />
        </div>

        <div className="border border-accent/30 bg-accent/10 p-4">
          <div className="flex items-start gap-3">
            <SlidersHorizontalIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">Maintenance rule</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                {catalog.updateRule}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Pod: {catalog.summary.podEndpoint ?? "not recorded"} · Tunnel:{" "}
                {catalog.summary.tunnel ?? "not recorded"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 border border-border/80 bg-card p-4">
        <div className="flex items-center gap-2">
          <FilterIcon className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="font-heading text-base font-semibold">Reference filters</h3>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_10rem_12rem_12rem]">
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
                placeholder="workflow, model, input, status..."
                className="pl-8"
              />
            </div>
          </label>
          <SelectFilter
            label="Media"
            value={media}
            values={mediaValues}
            onChange={(value) => setMedia(value as typeof media)}
          />
          <SelectFilter
            label="Input Mode"
            value={task}
            values={taskValues}
            labels={TASK_LABELS}
            onChange={(value) => setTask(value as typeof task)}
          />
          <SelectFilter
            label="Source"
            value={source}
            values={sourceValues}
            labels={SOURCE_LABELS}
            onChange={(value) => setSource(value as typeof source)}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight">
              Recommended workflows
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The practical starting points: name, details, settings, and best OpenPose/source.
            </p>
          </div>
          <Badge variant="secondary">{pinned.length}</Badge>
        </div>
        <div className="grid gap-3">
          {pinned.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight">
              Full workflow map
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {filtered.length} of {catalog.workflows.length} catalogued workflows.
              The default filter is Proven.
            </p>
          </div>
          <Badge variant={filtered.length ? "outline" : "destructive"}>
            {filtered.length}
          </Badge>
        </div>

        <div className="grid gap-3">
          {filtered.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
          {!filtered.length ? (
            <div className="border border-border/80 bg-card p-6 text-sm text-muted-foreground">
              No workflows match the current filters.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="font-heading text-lg font-semibold tracking-tight">
          Pod model inventory
        </h3>
        <div className="overflow-x-auto border border-border/80 bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border/80 bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {catalog.models.map((model) => (
                <tr key={`${model.role}-${model.file}`}>
                  <td className="px-3 py-2 align-top">
                    <Badge variant={model.status === "required" ? "secondary" : "outline"}>
                      {model.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                    {model.role}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <code className="break-all text-xs">{model.file}</code>
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">{model.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
