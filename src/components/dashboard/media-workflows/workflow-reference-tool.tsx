"use client";

import { useMemo, useState } from "react";
import {
  BoxesIcon,
  BookOpenIcon,
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
import { cn } from "@/lib/utils";
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

function firstModel(workflow: MediaWorkflowEntry) {
  return workflow.models[0] ?? workflow.loras[0] ?? workflow.controlModels[0] ?? null;
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
  const model = firstModel(workflow);
  const params = Object.entries(workflow.parameters).slice(0, 5);

  return (
    <article className="grid gap-4 border border-border/80 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={workflow.sourceSet === "runpod-smoke" ? "secondary" : "outline"}>
              {SOURCE_LABELS[workflow.sourceSet]}
            </Badge>
            <Badge variant="secondary">{workflow.media}</Badge>
            <Badge variant="outline">{TASK_LABELS[workflow.task]}</Badge>
          </div>
          <h3 className="mt-2 font-heading text-base font-semibold leading-snug text-foreground">
            {workflow.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{workflow.status}</span>
      </div>

      <div className="grid gap-3 text-sm">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Use When
          </p>
          <p className="mt-1 leading-relaxed text-foreground">{workflow.useWhen}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Why It Is Good
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{workflow.whyGood}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Inputs
        </p>
        <div className="flex flex-wrap gap-1.5">
          {workflow.inputs.map((input) => (
            <span
              key={input}
              className="border border-border/70 bg-background px-2 py-1 text-xs text-foreground"
            >
              {input}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          What Worked
        </p>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          {workflow.whatWorked.map((item) => (
            <li key={item} className="flex gap-2">
              <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {workflow.promptRecipe.lockedClauses.length ||
      workflow.parameterGuidance.length ||
      workflow.examplePrompts.length ? (
        <div className="grid gap-3 border border-border/70 bg-background p-3">
          <div className="flex items-center gap-2">
            <BookOpenIcon className="size-4 text-muted-foreground" aria-hidden />
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Prompt Recipe
            </p>
          </div>
          {workflow.promptRecipe.lockedClauses.length ? (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-foreground">Locked clauses</p>
              <ul className="grid gap-1 text-xs leading-relaxed text-muted-foreground">
                {workflow.promptRecipe.lockedClauses.slice(0, 3).map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {workflow.parameterGuidance.length ? (
            <div className="grid gap-2">
              <p className="text-xs font-medium text-foreground">Parameter guidance</p>
              <dl className="grid gap-1.5 text-xs md:grid-cols-2">
                {workflow.parameterGuidance.slice(0, 4).map((item) => (
                  <div key={item.name}>
                    <dt className="font-mono text-muted-foreground">{item.name}</dt>
                    <dd className="text-foreground">{item.recommendedRange}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {workflow.examplePrompts[0] ? (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-foreground">
                Example prompt structure
              </p>
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {workflow.examplePrompts[0].positive}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {model || workflow.controlModels.length || workflow.loras.length ? (
        <div className="grid gap-2 text-xs text-muted-foreground">
          <p className="font-semibold tracking-wide uppercase">Stack</p>
          {model ? <p className="break-all">Primary: {model}</p> : null}
          {workflow.controlModels.length ? (
            <p className="break-all">ControlNet: {workflow.controlModels.join(", ")}</p>
          ) : null}
          {workflow.loras.length ? (
            <p className="break-all">LoRA: {workflow.loras.join(", ")}</p>
          ) : null}
        </div>
      ) : null}

      {params.length ? (
        <dl className="grid grid-cols-2 gap-2 border-y border-border/70 py-3 text-xs md:grid-cols-5">
          {params.map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium text-muted-foreground">{key}</dt>
              <dd className="mt-0.5 font-mono text-foreground">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="grid gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all bg-muted/50 px-2 py-1">
            {displayPath(workflow.path)}
          </code>
          <CopyButton value={workflow.path} />
        </div>
        {workflow.cloudPath ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all bg-muted/50 px-2 py-1">
              {workflow.cloudPath}
            </code>
            <CopyButton value={workflow.cloudPath} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function WorkflowReferenceTool({ catalog }: Props) {
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState<"all" | MediaWorkflowEntry["media"]>("all");
  const [task, setTask] = useState<FilterValue | MediaWorkflowTask>("all");
  const [source, setSource] = useState<FilterValue | MediaWorkflowEntry["sourceSet"]>("all");

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
          "wan22-gguf-camera-i2v-rife2x-production-current-v19-api.json",
          "Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_api.json",
          "Avery_Yoga_08_CurrentBest_IPA_Img2Img_w035_d180_api.json",
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
            label="Favourites"
            value={catalog.summary.favouriteWorkflowCount}
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
              Start-here workflows
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The most useful defaults and recently promoted branches.
            </p>
          </div>
          <Badge variant="secondary">{pinned.length}</Badge>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
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
            </p>
          </div>
          <Badge variant={filtered.length ? "outline" : "destructive"}>
            {filtered.length}
          </Badge>
        </div>

        <div className={cn("grid gap-4", filtered.length > 1 && "xl:grid-cols-2")}>
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
