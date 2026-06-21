"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  InfoIcon,
  Loader2Icon,
  SaveIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  MediaWorkflowCatalog,
  MediaWorkflowEntry,
} from "@/lib/media-workflows/types";
import type {
  PromptPresetSummary,
  PromptRunSummary,
} from "@/lib/prompt-builder/metrics";
import type { PromptBuilderOutput } from "@/lib/prompt-builder/schema";

type Props = {
  catalog: MediaWorkflowCatalog;
};

type BriefState = {
  subjectPreset: string;
  settingPreset: string;
  lightingPreset: string;
  cameraPreset: string;
  subject: string;
  scene: string;
  action: string;
  mood: string;
  lighting: string;
  camera: string;
  composition: string;
  style: string;
  constraints: string;
  negativeAdditions: string;
  selectedTokens: string[];
};

type Preset = {
  id: string;
  label: string;
  value: string;
  helper: string;
};

type RunsSummary = {
  averageRating: number | null;
  keeperCount: number;
  recentRunCount: number;
  topNotes: string[];
};

type RunsPayload = {
  available: boolean;
  runs: PromptRunSummary[];
  summary: RunsSummary;
  error?: string;
};

type PresetsPayload = {
  available: boolean;
  presets: PromptPresetSummary[];
  error?: string;
};

type WorkflowFamilyId =
  | "all"
  | "text2img"
  | "openpose"
  | "img2img"
  | "inpaint"
  | "closeup"
  | "video"
  | "export";

type WorkflowFamily = {
  id: WorkflowFamilyId;
  label: string;
  helper: string;
};

const WORKFLOW_FAMILIES: WorkflowFamily[] = [
  {
    id: "all",
    label: "All",
    helper: "Everything prompt-capable.",
  },
  {
    id: "text2img",
    label: "Start from scratch",
    helper: "Prompt-only stills.",
  },
  {
    id: "openpose",
    label: "Pose control",
    helper: "Needs OpenPose reference.",
  },
  {
    id: "img2img",
    label: "Source refine",
    helper: "Needs source image.",
  },
  {
    id: "inpaint",
    label: "Repair / detail",
    helper: "Needs source and mask.",
  },
  {
    id: "closeup",
    label: "Portrait / close-up",
    helper: "Face or detail crops.",
  },
  {
    id: "video",
    label: "Video motion",
    helper: "I2V or frame continuity.",
  },
  {
    id: "export",
    label: "Export / smooth",
    helper: "Upscale or interpolation.",
  },
];

const SUBJECT_PRESETS: Preset[] = [
  {
    id: "adult-girl-next-door",
    label: "Adult girl-next-door",
    value:
      "fictional clearly adult girl-next-door editorial subject, late-20s or older styling, natural approachable confidence",
    helper: "Soft approachable styling while staying explicitly adult.",
  },
  {
    id: "hipster-editorial",
    label: "Hipster editorial",
    value:
      "fictional clearly adult hipster female subject with layered casual styling, expressive mature face, understated confidence",
    helper: "Changes styling and identity lane without changing pose control.",
  },
  {
    id: "mature-luxury",
    label: "Mature luxury",
    value:
      "fictional mature adult luxury fashion subject with refined styling, calm expression, elegant posture",
    helper: "Best for restrained editorial or fine-art looks.",
  },
  {
    id: "rubenesque-mature",
    label: "Rubenesque mature",
    value:
      "fictional rubenesque mature adult female subject with tasteful fashion styling, confident relaxed presence",
    helper: "Adjusts body/look language while preserving adult framing.",
  },
  {
    id: "athletic-editorial",
    label: "Athletic editorial",
    value:
      "fictional clearly adult athletic editorial subject, natural mature features, clean contemporary styling",
    helper: "Useful for yoga, motion, and full-body composition tests.",
  },
];

const SETTING_PRESETS: Preset[] = [
  {
    id: "beach-golden-hour",
    label: "Beach golden hour",
    value:
      "secluded beach setting at golden hour with clean background separation and warm shoreline atmosphere",
    helper: "Known-good baseline for current full-body still and video branches.",
  },
  {
    id: "coffee-shop",
    label: "Cozy coffee shop",
    value:
      "cozy independent coffee shop corner with warm window light, wood textures, shallow background detail",
    helper: "Swaps location while keeping natural light and editorial realism.",
  },
  {
    id: "boudoir-low-key",
    label: "Low-key boudoir",
    value:
      "tasteful low-key boudoir interior with soft directional light, quiet editorial mood, uncluttered background",
    helper: "Moodier interior setup without explicit-action framing.",
  },
  {
    id: "apartment-window",
    label: "Apartment window",
    value:
      "modern apartment interior near a large window, neutral textures, clean daylight separation",
    helper: "Good for natural skin highlights and source-preserving edits.",
  },
  {
    id: "editorial-studio",
    label: "Editorial studio",
    value:
      "minimal editorial studio with seamless neutral backdrop and controlled photographic separation",
    helper: "Useful when background simplicity matters more than setting detail.",
  },
];

const LIGHTING_PRESETS: Preset[] = [
  {
    id: "golden-hour",
    label: "Golden hour",
    value: "golden-hour side light with soft realistic skin highlights",
    helper: "Warm, proven, and easy to compare against existing beach outputs.",
  },
  {
    id: "window-glow",
    label: "Window glow",
    value: "warm window glow with gentle falloff and natural shadow detail",
    helper: "Works for coffee shop and apartment settings.",
  },
  {
    id: "low-key",
    label: "Low-key interior",
    value: "low-key interior light with subtle rim separation and soft shadow rolloff",
    helper: "Creates a more dramatic look while preserving realism.",
  },
  {
    id: "overcast",
    label: "Soft overcast",
    value: "soft overcast daylight with even skin tone and restrained contrast",
    helper: "Useful when anatomy and identity are more important than drama.",
  },
];

const CAMERA_PRESETS: Preset[] = [
  {
    id: "50mm-documentary",
    label: "50mm documentary",
    value: "50mm documentary photograph, camera pulled back, natural perspective",
    helper: "Stable default for realistic full-body compositions.",
  },
  {
    id: "85mm-editorial",
    label: "85mm editorial",
    value: "85mm editorial photograph with shallow depth of field and realistic lens compression",
    helper: "Adds polish, but can fight full-body crops if overused.",
  },
  {
    id: "full-body-stable",
    label: "Full-body stable",
    value:
      "camera pulled back, stable vertical full-body composition, head-to-feet framing",
    helper: "Best paired with OpenPose reference images.",
  },
  {
    id: "subtle-push",
    label: "Subtle push-in",
    value: "subtle controlled camera push-in with stable subject continuity",
    helper: "Video-oriented camera language for I2V prompts.",
  },
];

const MOOD_TOKENS = [
  "clean editorial",
  "quiet confidence",
  "luxury fashion",
  "documentary realism",
  "fine-art restraint",
  "natural candid energy",
];

const CONTROL_TOKENS = [
  "follow the OpenPose reference",
  "preserve identity",
  "preserve lighting",
  "local edit only",
  "stable single-subject continuity",
  "avoid crop drift",
  "both hands and feet in frame",
  "clean background separation",
];

const FAILURE_MODES = [
  "pose drift",
  "identity drift",
  "crop drift",
  "bad hands/feet",
  "lighting mismatch",
  "low realism",
  "motion artifacts",
  "mask bleed",
];

const DEFAULT_BRIEF: BriefState = {
  subjectPreset: SUBJECT_PRESETS[0]!.id,
  settingPreset: SETTING_PRESETS[0]!.id,
  lightingPreset: LIGHTING_PRESETS[0]!.id,
  cameraPreset: CAMERA_PRESETS[2]!.id,
  subject: SUBJECT_PRESETS[0]!.value,
  scene: SETTING_PRESETS[0]!.value,
  action: "calm controlled pose with natural mature expression",
  mood: "tasteful editorial realism",
  lighting: LIGHTING_PRESETS[0]!.value,
  camera: CAMERA_PRESETS[2]!.value,
  composition: "vertical head-to-toe long-shot composition with both hands and feet visible",
  style: "photorealistic, natural skin texture, restrained color grade",
  constraints:
    "lawful, fictional, clearly adult, consented, non-celebrity, non-public-figure, non-coercive, non-explicit-action",
  negativeAdditions:
    "watermark, text, logo, distorted anatomy, bad hands, bad feet, blurry, low quality",
  selectedTokens: [
    "follow the OpenPose reference",
    "stable single-subject continuity",
    "clean editorial",
  ],
};

function taskLabel(task: MediaWorkflowEntry["task"]) {
  return task
    .replace("text2img", "Text2img")
    .replace("img2img", "Img2img")
    .replace("openpose", "OpenPose")
    .replace("i2v", "I2V")
    .replace("first-last-frame", "FLF")
    .replace("upscale-export", "Export")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function workflowFamily(workflow: MediaWorkflowEntry): WorkflowFamilyId {
  const text = `${workflow.title} ${workflow.path} ${workflow.useWhen}`.toLowerCase();
  if (
    workflow.task === "i2v" ||
    workflow.task === "first-last-frame" ||
    workflow.task === "interpolation"
  ) {
    return "video";
  }
  if (workflow.task === "upscale-export") {
    return "export";
  }
  if (
    text.includes("face") ||
    text.includes("portrait") ||
    text.includes("close") ||
    text.includes("skin tone") ||
    text.includes("cleanup")
  ) {
    return "closeup";
  }
  if (workflow.task === "openpose") {
    return "openpose";
  }
  if (workflow.task === "img2img") {
    return "img2img";
  }
  if (workflow.task === "inpaint") {
    return "inpaint";
  }
  if (workflow.task === "text2img") {
    return "text2img";
  }
  return "all";
}

function compactWorkflowTitle(workflow: MediaWorkflowEntry) {
  return workflow.title
    .replace(/\b(SDXL|API|UI|GGUF)\b/g, "")
    .replace(/\b(Current|Recommended|Reference|Production)\b/gi, "")
    .replace(/\bV(\d+)\b/g, "v$1")
    .replace(/\s+/g, " ")
    .trim();
}

function workflowDimensions(workflow: MediaWorkflowEntry) {
  const width = workflow.parameters.width;
  const height = workflow.parameters.height;
  if (
    (typeof width === "number" || typeof width === "string") &&
    (typeof height === "number" || typeof height === "string")
  ) {
    return `${width}x${height}`;
  }
  const fromInputs = workflow.imageInputs
    .map((input) => input.match(/(\d{3,4})x(\d{3,4})/i)?.[0])
    .find(Boolean);
  return fromInputs ?? "";
}

function workflowRequirementLabel(workflow: MediaWorkflowEntry) {
  const inputs = workflow.inputs.join(" ").toLowerCase();
  if (workflow.task === "openpose" || inputs.includes("openpose")) {
    return "needs OpenPose reference";
  }
  if (workflow.task === "inpaint" || inputs.includes("mask")) {
    return "needs source + mask";
  }
  if (["img2img", "i2v", "first-last-frame"].includes(workflow.task)) {
    return workflow.task === "first-last-frame"
      ? "needs start + end frames"
      : "needs source image";
  }
  if (workflow.task === "text2img") {
    return "prompt only";
  }
  return workflow.inputs.length ? workflow.inputs.slice(0, 2).join(" + ") : "";
}

function workflowPromptHint(workflow: MediaWorkflowEntry) {
  if (workflow.task === "openpose") {
    return "This workflow is pose-led. Keep the prompt focused on subject, setting, lighting, style, and camera; let the OpenPose reference control body placement and framing.";
  }
  if (workflow.task === "img2img") {
    return "This workflow is source-led. Prompt one controlled change at a time and preserve identity, composition, lighting, and camera distance unless you explicitly want drift.";
  }
  if (workflow.task === "inpaint") {
    return "This workflow is mask-led. Write the prompt for the masked area only and keep surrounding pixels, perspective, and lighting stable.";
  }
  if (workflow.task === "i2v" || workflow.task === "first-last-frame") {
    return "This workflow is continuity-led. Use concise motion language and avoid broad scene changes that compete with the source keyframe.";
  }
  return "This workflow is prompt-led. Make subject, setting, composition, lighting, camera, and style explicit because there is no control image to anchor the result.";
}

function badgeClassForTag(tag: string) {
  const normalized = tag.toLowerCase();
  if (normalized.includes("img2img")) {
    return "border-sky-300/70 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (normalized.includes("current")) {
    return "border-emerald-300/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (normalized.includes("openpose")) {
    return "border-violet-300/70 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  }
  if (normalized.includes("inpaint") || normalized.includes("repair")) {
    return "border-amber-300/70 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (normalized.includes("video") || normalized.includes("i2v")) {
    return "border-rose-300/70 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return "border-border bg-background text-foreground";
}

function chooseDefaultWorkflow(workflows: MediaWorkflowEntry[]) {
  return (
    workflows.find((workflow) =>
      workflow.path.endsWith(
        "sdxl-photoreal-openpose-production-current-v18-api.json",
      ),
    ) ??
    workflows.find((workflow) =>
      workflow.path.endsWith("sdxl-master-openpose-keyframe-recommended-v03-api.json"),
    ) ??
    workflows[0]
  );
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean)
    .join(", ");
}

function truncate(input: string, max: number) {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}...`;
}

function stringValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "not extracted";
  return String(value);
}

function workflowControl(workflow: MediaWorkflowEntry) {
  if (workflow.promptRecipe.lockedClauses.length) {
    return workflow.promptRecipe.lockedClauses.join(", ");
  }
  if (workflow.task === "openpose") {
    return "follow the OpenPose reference for pose and body placement, preserve head-to-feet framing";
  }
  if (workflow.task === "img2img") {
    return "preserve the source image identity, composition, and lighting";
  }
  if (workflow.task === "inpaint") {
    return "edit only the masked area and preserve the surrounding image";
  }
  if (workflow.task === "i2v") {
    return "stable continuity from the accepted source keyframe with subtle natural motion";
  }
  if (workflow.task === "first-last-frame") {
    return "preserve continuity between the start and end frames";
  }
  return "";
}

function buildLocalPrompt(
  workflow: MediaWorkflowEntry,
  brief: BriefState,
  parameterOverrides: Record<string, string>,
  successSummary: RunsSummary,
) {
  const sections: PromptBuilderOutput["promptSections"] = [
    {
      id: "subject",
      label: "Subject / look",
      text: brief.subject,
      locked: false,
      source: "user" as const,
    },
    {
      id: "setting",
      label: "Setting",
      text: brief.scene,
      locked: false,
      source: "user" as const,
    },
    {
      id: "action",
      label: "Action / pose",
      text: brief.action,
      locked: workflow.task === "openpose",
      source: workflow.task === "openpose" ? ("workflow" as const) : ("user" as const),
    },
    {
      id: "composition",
      label: "Composition",
      text: brief.composition,
      locked: workflow.task === "openpose",
      source: workflow.task === "openpose" ? ("workflow" as const) : ("user" as const),
    },
    {
      id: "lighting",
      label: "Lighting",
      text: brief.lighting,
      locked: false,
      source: "user" as const,
    },
    {
      id: "camera",
      label: "Camera",
      text: brief.camera,
      locked: false,
      source: "user" as const,
    },
    {
      id: "style",
      label: "Style / finish",
      text: joinParts([brief.mood, brief.style]),
      locked: false,
      source: "user" as const,
    },
    {
      id: "workflow-control",
      label: "Workflow control",
      text: workflowControl(workflow),
      locked: true,
      source: "workflow" as const,
    },
    {
      id: "safety",
      label: "Safety constraints",
      text: brief.constraints,
      locked: true,
      source: "safety" as const,
    },
  ].filter((section) => section.text.trim());

  const positivePrompt = truncate(
    joinParts([
      ...sections
        .filter((section) => section.id !== "safety")
        .map((section) => section.text),
      ...brief.selectedTokens,
    ]),
    2600,
  );
  const negativePrompt = truncate(
    joinParts([
      ...workflow.promptRecipe.negativeBase,
      workflow.promptPreview.negative,
      brief.negativeAdditions,
    ]),
    2000,
  );

  return {
    positivePrompt,
    negativePrompt,
    promptSections: sections,
    suggestedParameters: workflow.parameterGuidance.slice(0, 8).map((item) => ({
      name: item.name,
      currentValue: stringValue(item.currentValue),
      suggestedValue:
        parameterOverrides[item.name]?.trim() || stringValue(item.currentValue),
      recommendedRange: item.recommendedRange,
      reason: item.effect,
      risk: item.warning,
    })),
    workflowNotes: [
      `Mode: ${taskLabel(workflow.task)}.`,
      workflow.useWhen,
      workflow.whyGood,
      ...workflow.promptRecipe.promptNotes,
    ]
      .slice(0, 8)
      .map((note) => truncate(note, 240)),
    variants: [
      {
        label: "Setting swap",
        positivePrompt: truncate(
          joinParts([
            brief.subject,
            "same workflow control structure",
            brief.scene,
            brief.lighting,
            workflowControl(workflow),
            brief.style,
          ]),
          2200,
        ),
        reason: "Changes the setting or light while preserving workflow control.",
      },
      {
        label: "Conservative test",
        positivePrompt: truncate(
          joinParts([
            positivePrompt,
            "small controlled variation, keep known-good workflow parameters stable",
          ]),
          2200,
        ),
        reason: "Best for apples-to-apples comparison against saved outputs.",
      },
    ],
    fitChecks: [
      {
        label: "Workflow mode",
        status: workflow.task === "reference" ? "review" : "pass",
        detail: `${taskLabel(workflow.task)} structure is active.`,
      },
      {
        label: "Required inputs",
        status: workflow.inputs.length ? "pass" : "review",
        detail: workflow.inputs.length
          ? workflow.inputs.join(", ")
          : "No required inputs were extracted.",
      },
      {
        label: "Known-good context",
        status: successSummary.recentRunCount > 0 ? "pass" : "review",
        detail:
          successSummary.recentRunCount > 0
            ? `${successSummary.recentRunCount} saved run(s), ${successSummary.keeperCount} keeper(s).`
            : "No saved success metrics for this workflow yet.",
      },
      {
        label: "Adult-only boundary",
        status: /adult|mature/.test(brief.subject.toLowerCase())
          ? "pass"
          : "review",
        detail: "Subject language should stay clearly adult and fictional.",
      },
    ],
    warnings: [],
  } satisfies PromptBuilderOutput;
}

function formatDate(input: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(input));
}

function averageLabel(value: number | null) {
  return value === null ? "No ratings" : `${value.toFixed(1)} / 5`;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" variant="ghost" size="icon-xs" aria-label="More info" />
        }
      >
        <InfoIcon aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Button type="button" variant="outline" className="bg-background" onClick={() => void copy()}>
      {copied ? (
        <CheckCircle2Icon data-icon="inline-start" aria-hidden />
      ) : (
        <ClipboardIcon data-icon="inline-start" aria-hidden />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function PresetSelect({
  label,
  presets,
  activeId,
  onApply,
  emphasis = false,
}: {
  label: string;
  presets: Preset[];
  activeId: string;
  onApply: (preset: Preset) => void;
  emphasis?: boolean;
}) {
  const activePreset = presets.find((preset) => preset.id === activeId) ?? presets[0];
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        emphasis && "border border-emerald-300/70 bg-emerald-500/10 p-3",
      )}
    >
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        <select
          value={activeId}
          onChange={(event) => {
            const preset = presets.find((item) => item.id === event.currentTarget.value);
            if (preset) onApply(preset);
          }}
          className="h-10 border border-border/80 bg-background px-3 text-sm text-foreground outline-none transition-colors hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      {activePreset ? (
        <p className={cn("text-xs leading-relaxed", emphasis ? "text-foreground" : "text-muted-foreground")}>
          {activePreset.helper}
        </p>
      ) : null}
    </div>
  );
}

function TokenBank({
  label,
  tokens,
  selected,
  onToggle,
}: {
  label: string;
  tokens: string[];
  selected: string[];
  onToggle: (token: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((token) => {
          const active = selected.includes(token);
          return (
            <Button
              key={token}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={cn("h-auto min-h-7 justify-start whitespace-normal", !active && "bg-background")}
              onClick={() => onToggle(token)}
            >
              {token}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  rows = 3,
  help,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  help: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {label}
        <InfoTooltip text={help} />
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-20 resize-y border border-border/80 bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      />
    </label>
  );
}

function GuidanceSheet({ workflow }: { workflow: MediaWorkflowEntry }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <InfoIcon data-icon="inline-start" aria-hidden />
        Workflow Guide
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Workflow guide</SheetTitle>
          <SheetDescription>
            Prompt structure, locked clauses, and parameter behavior for this workflow.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <section className="grid gap-2">
            <h4 className="font-heading text-sm font-semibold">Prompt scaffold</h4>
            <div className="flex flex-wrap gap-1.5">
              {workflow.promptRecipe.scaffold.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <h4 className="font-heading text-sm font-semibold">Locked clauses</h4>
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {workflow.promptRecipe.lockedClauses.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2Icon className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3">
            <h4 className="font-heading text-sm font-semibold">Parameter behavior</h4>
            {workflow.parameterGuidance.map((item) => (
              <article key={item.name} className="border border-border/80 bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{item.name}</p>
                    <p className="text-sm font-medium text-foreground">
                      Current: {stringValue(item.currentValue)}
                    </p>
                  </div>
                  <Badge variant="secondary">{item.recommendedRange}</Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.effect}
                </p>
                <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="font-medium text-foreground">Increase</dt>
                    <dd>{item.increaseEffect}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Decrease</dt>
                    <dd>{item.decreaseEffect}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Watch for</dt>
                    <dd>{item.warning}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>

          <section className="grid gap-3">
            <h4 className="font-heading text-sm font-semibold">Examples</h4>
            {workflow.examplePrompts.map((example) => (
              <article key={example.sourcePath} className="border border-border/80 bg-card p-3">
                <p className="text-sm font-medium text-foreground">{example.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {example.note}
                </p>
                <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap bg-background p-3 text-xs leading-relaxed">
                  {example.positive}
                </pre>
              </article>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WorkflowSummary({ workflow }: { workflow: MediaWorkflowEntry }) {
  const params = Object.entries(workflow.parameters).slice(0, 8);
  const dimensions = workflowDimensions(workflow);
  const requirement = workflowRequirementLabel(workflow);
  return (
    <section className="grid gap-4 border border-border/80 bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={badgeClassForTag(workflow.media)}>
              {workflow.media}
            </Badge>
            <Badge variant="outline" className={badgeClassForTag(taskLabel(workflow.task))}>
              {taskLabel(workflow.task)}
            </Badge>
            <Badge variant="outline" className={badgeClassForTag(workflow.status)}>
              {workflow.status.replace(/[-_]/g, " ")}
            </Badge>
            {dimensions ? (
              <Badge variant="outline" className="border-foreground/30 bg-background">
                {dimensions}
              </Badge>
            ) : null}
            {requirement ? (
              <Badge variant="outline" className={badgeClassForTag(requirement)}>
                {requirement}
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-2 font-heading text-lg font-semibold tracking-tight">
            {workflow.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {workflow.useWhen}
          </p>
        </div>
        <GuidanceSheet workflow={workflow} />
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Why It Works
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {workflow.whyGood}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Inputs
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {workflow.inputs.join(", ")}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Stack
          </p>
          <p className="mt-1 break-words leading-relaxed text-muted-foreground">
            {[...workflow.models, ...workflow.loras, ...workflow.controlModels]
              .slice(0, 3)
              .join(", ") || "No model stack extracted."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border/70 pt-3 text-sm md:grid-cols-[1.1fr_1fr_1fr]">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Prompt Guidance
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {workflowPromptHint(workflow)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Required Files
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {workflow.inputs.join(", ") || "Prompt only."}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Reference Images
          </p>
          <p className="mt-1 break-words leading-relaxed text-muted-foreground">
            {workflow.imageInputs.filter(Boolean).slice(0, 3).join(", ") || "None required."}
          </p>
        </div>
      </div>

      {params.length ? (
        <dl className="grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs md:grid-cols-4">
          {params.map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium text-muted-foreground">{key}</dt>
              <dd className="mt-0.5 font-mono text-foreground">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function WorkflowChooser({
  workflows,
  activeWorkflowId,
  activeFamily,
  onFamilyChange,
  onWorkflowChange,
}: {
  workflows: MediaWorkflowEntry[];
  activeWorkflowId: string;
  activeFamily: WorkflowFamilyId;
  onFamilyChange: (family: WorkflowFamilyId) => void;
  onWorkflowChange: (workflowId: string) => void;
}) {
  const familyCounts = WORKFLOW_FAMILIES.reduce<Record<WorkflowFamilyId, number>>(
    (counts, family) => {
      counts[family.id] =
        family.id === "all"
          ? workflows.length
          : workflows.filter((workflow) => workflowFamily(workflow) === family.id).length;
      return counts;
    },
    {
      all: 0,
      text2img: 0,
      openpose: 0,
      img2img: 0,
      inpaint: 0,
      closeup: 0,
      video: 0,
      export: 0,
    },
  );
  const visibleWorkflows = workflows.filter(
    (workflow) => activeFamily === "all" || workflowFamily(workflow) === activeFamily,
  );

  return (
    <section className="grid gap-4 border border-border/80 bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-base font-semibold">Choose workflow type</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Start with the job the workflow needs to do, then pick the specific recipe.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {WORKFLOW_FAMILIES.filter((family) => familyCounts[family.id] > 0).map((family) => {
          const active = activeFamily === family.id;
          return (
            <button
              key={family.id}
              type="button"
              onClick={() => onFamilyChange(family.id)}
              className={cn(
                "border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-accent bg-accent/10"
                  : "border-border/80 bg-background hover:border-foreground/40",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{family.label}</span>
                <Badge variant="outline">{familyCounts[family.id]}</Badge>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {family.helper}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-2">
        {visibleWorkflows.map((candidate) => {
          const active = activeWorkflowId === candidate.id;
          const dimensions = workflowDimensions(candidate);
          const requirement = workflowRequirementLabel(candidate);
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onWorkflowChange(candidate.id)}
              className={cn(
                "border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-accent bg-accent/10"
                  : "border-border/80 bg-background hover:border-foreground/40",
              )}
            >
              <span className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {compactWorkflowTitle(candidate)}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                    {candidate.useWhen}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-1.5">
                  <Badge variant="outline" className={badgeClassForTag(taskLabel(candidate.task))}>
                    {taskLabel(candidate.task)}
                  </Badge>
                  <Badge variant="outline" className={badgeClassForTag(candidate.status)}>
                    {candidate.status.replace(/[-_]/g, " ")}
                  </Badge>
                  {dimensions ? <Badge variant="outline">{dimensions}</Badge> : null}
                  {requirement ? (
                    <Badge variant="outline" className={badgeClassForTag(requirement)}>
                      {requirement}
                    </Badge>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ParameterPanel({
  workflow,
  parameterOverrides,
  onChange,
}: {
  workflow: MediaWorkflowEntry;
  parameterOverrides: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <section className="grid gap-3 border border-border/80 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">Parameter guidance</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Track planned overrides while keeping known-good defaults visible.
          </p>
        </div>
        <SlidersHorizontalIcon className="shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <div className="grid gap-3">
        {workflow.parameterGuidance.slice(0, 8).map((item) => (
          <article key={item.name} className="grid gap-3 border border-border/70 bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{item.name}</p>
                <p className="text-sm font-medium text-foreground">
                  Current: {stringValue(item.currentValue)}
                </p>
              </div>
              <Badge variant="secondary">{item.recommendedRange}</Badge>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{item.effect}</p>
            <Input
              value={parameterOverrides[item.name] ?? ""}
              onChange={(event) => onChange(item.name, event.currentTarget.value)}
              placeholder="Optional test value or note"
            />
          </article>
        ))}
        {!workflow.parameterGuidance.length ? (
          <p className="text-sm text-muted-foreground">
            No parameter guidance was extracted for this workflow yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function KnownGoodPanel({
  summary,
  runs,
  presets,
  metricsAvailable,
  onApplyPreset,
}: {
  summary: RunsSummary;
  runs: PromptRunSummary[];
  presets: PromptPresetSummary[];
  metricsAvailable: boolean | null;
  onApplyPreset: (preset: PromptPresetSummary) => void;
}) {
  const bestRuns = runs.filter((run) => run.keeper || (run.rating ?? 0) >= 4).slice(0, 3);
  return (
    <section className="grid gap-4 border border-border/80 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">Known-good memory</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Supabase-backed ratings, keepers, and reusable prompt configurations.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={metricsAvailable === false ? "destructive" : "secondary"}>
            {metricsAvailable === false ? "Tables missing" : averageLabel(summary.averageRating)}
          </Badge>
          <Badge variant="outline">{summary.keeperCount} keepers</Badge>
        </div>
      </div>

      {presets.length ? (
        <div className="grid gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Saved presets
          </p>
          {presets.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset)}
              className="border border-border/70 bg-background p-3 text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-sm font-medium text-foreground">{preset.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {preset.notes || `Saved ${formatDate(preset.createdAt)}`}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {bestRuns.length ? (
        <div className="grid gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent keepers
          </p>
          {bestRuns.map((run) => (
            <article key={run.id} className="border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {run.keeper ? (
                  <Badge variant="secondary">
                    <StarIcon data-icon="inline-start" aria-hidden />
                    Keeper
                  </Badge>
                ) : null}
                {run.rating ? <Badge variant="outline">{run.rating} / 5</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {formatDate(run.createdAt)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {run.notes || run.positivePrompt}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No saved keeper runs for this workflow yet.
        </p>
      )}
    </section>
  );
}

function MetricsWriter({
  workflow,
  brief,
  parameterOverrides,
  activeResult,
  onSaved,
}: {
  workflow: MediaWorkflowEntry;
  brief: BriefState;
  parameterOverrides: Record<string, string>;
  activeResult: PromptBuilderOutput;
  onSaved: () => Promise<void>;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [keeper, setKeeper] = useState(false);
  const [notes, setNotes] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [presetName, setPresetName] = useState("");
  const [failureModes, setFailureModes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function toggleFailure(mode: string) {
    setFailureModes((current) =>
      current.includes(mode)
        ? current.filter((item) => item !== mode)
        : [...current, mode],
    );
  }

  async function saveRun() {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/dashboard/tools/prompt-builder/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          workflowTitle: workflow.title,
          workflowTask: workflow.task,
          positivePrompt: activeResult.positivePrompt,
          negativePrompt: activeResult.negativePrompt,
          promptSections: activeResult.promptSections,
          parameterOverrides,
          selectedPresets: {
            subjectPreset: brief.subjectPreset,
            settingPreset: brief.settingPreset,
            lightingPreset: brief.lightingPreset,
            cameraPreset: brief.cameraPreset,
          },
          rating,
          keeper,
          notes,
          failureModes,
          outputPath,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save run.");
      setMessage("Saved run.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save run.");
    } finally {
      setIsSaving(false);
    }
  }

  async function savePreset() {
    if (!presetName.trim()) {
      setMessage("Name the preset before saving.");
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/dashboard/tools/prompt-builder/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          workflowTitle: workflow.title,
          name: presetName.trim(),
          brief,
          parameterOverrides,
          notes,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save preset.");
      setMessage("Saved preset.");
      setPresetName("");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save preset.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid gap-4 border border-border/80 bg-card p-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Track output</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Save what worked, what failed, and the parameter notes needed for the next run.
        </p>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Rating
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={rating === value ? "default" : "outline"}
              className={rating === value ? "" : "bg-background"}
              onClick={() => setRating(value)}
            >
              {value}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={keeper ? "default" : "outline"}
            className={keeper ? "" : "bg-background"}
            onClick={() => setKeeper((value) => !value)}
          >
            <StarIcon data-icon="inline-start" aria-hidden />
            Keeper
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Failure modes
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FAILURE_MODES.map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={failureModes.includes(mode) ? "default" : "outline"}
              className={failureModes.includes(mode) ? "" : "bg-background"}
              onClick={() => toggleFailure(mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
      </div>

      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        Notes
        <textarea
          value={notes}
          rows={3}
          onChange={(event) => setNotes(event.currentTarget.value)}
          className="min-h-20 resize-y border border-border/80 bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>

      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        Output path or label
        <Input
          value={outputPath}
          onChange={(event) => setOutputPath(event.currentTarget.value)}
          placeholder="Selected_Current_Results/... or quick label"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={presetName}
          onChange={(event) => setPresetName(event.currentTarget.value)}
          placeholder="Preset name"
        />
        <Button type="button" variant="outline" onClick={() => void savePreset()} disabled={isSaving}>
          <SaveIcon data-icon="inline-start" aria-hidden />
          Save Preset
        </Button>
      </div>

      <Button type="button" onClick={() => void saveRun()} disabled={isSaving}>
        {isSaving ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <SaveIcon data-icon="inline-start" aria-hidden />
        )}
        Save Run
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </section>
  );
}

function PromptOutputPanel({
  activeResult,
  result,
  error,
  isGenerating,
  onOptimize,
}: {
  activeResult: PromptBuilderOutput;
  result: PromptBuilderOutput | null;
  error: string | null;
  isGenerating: boolean;
  onOptimize: () => void;
}) {
  return (
    <aside className="grid h-fit gap-4 border border-border/80 bg-card p-4 xl:sticky xl:top-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-lg font-semibold tracking-tight">
            Prompt output
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {result ? "AI checked and revised" : "Structured draft ready for review"}
          </p>
        </div>
        <Button type="button" onClick={onOptimize} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : (
            <SparklesIcon data-icon="inline-start" aria-hidden />
          )}
          Check with AI
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      {activeResult.warnings.length ? (
        <div className="grid gap-1.5 border border-accent/30 bg-accent/10 p-3 text-sm">
          {activeResult.warnings.map((warning) => (
            <p key={warning} className="text-muted-foreground">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Positive
          </p>
          <CopyButton value={activeResult.positivePrompt} />
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border border-border/80 bg-background p-3 text-xs leading-relaxed text-foreground">
          {activeResult.positivePrompt}
        </pre>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Negative
          </p>
          <CopyButton value={activeResult.negativePrompt} />
        </div>
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap border border-border/80 bg-background p-3 text-xs leading-relaxed text-foreground">
          {activeResult.negativePrompt}
        </pre>
      </div>

      <details className="border border-border/70 bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Review sections, fit checks, and variants
        </summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Sections
            </p>
            <div className="grid gap-2">
              {activeResult.promptSections.map((section) => (
                <article key={section.id} className="border border-border/70 bg-card p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground">{section.label}</p>
                    {section.locked ? <Badge variant="secondary">locked</Badge> : null}
                    <Badge variant="outline">{section.source}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {section.text}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Fit checks
            </p>
            <div className="grid gap-1.5">
              {activeResult.fitChecks.map((check) => (
                <div key={check.label} className="flex gap-2 text-sm">
                  <CheckCircle2Icon
                    className={cn(
                      "mt-0.5 shrink-0",
                      check.status === "pass"
                        ? "text-accent"
                        : check.status === "review"
                          ? "text-muted-foreground"
                          : "text-destructive",
                    )}
                    aria-hidden
                  />
                  <div>
                    <p className="font-medium text-foreground">{check.label}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {check.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Variants
            </p>
            <div className="grid gap-2">
              {activeResult.variants.map((variant) => (
                <details key={variant.label} className="border border-border/70 bg-card p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    {variant.label}
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">{variant.reason}</p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {variant.positivePrompt}
                  </pre>
                </details>
              ))}
            </div>
          </div>
        </div>
      </details>
    </aside>
  );
}

export function PromptBuilderTool({ catalog }: Props) {
  const promptWorkflows = useMemo(
    () =>
      catalog.workflows.filter((workflow) =>
        [
          "text2img",
          "openpose",
          "img2img",
          "inpaint",
          "i2v",
          "first-last-frame",
        ].includes(workflow.task),
      ),
    [catalog.workflows],
  );

  const defaultWorkflow = useMemo(
    () => chooseDefaultWorkflow(promptWorkflows),
    [promptWorkflows],
  );
  const [workflowId, setWorkflowId] = useState(defaultWorkflow?.id ?? "");
  const [brief, setBrief] = useState<BriefState>(DEFAULT_BRIEF);
  const [parameterOverrides, setParameterOverrides] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PromptBuilderOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [runs, setRuns] = useState<PromptRunSummary[]>([]);
  const [presets, setPresets] = useState<PromptPresetSummary[]>([]);
  const [metricsAvailable, setMetricsAvailable] = useState<boolean | null>(null);
  const [builderMode, setBuilderMode] = useState<"wizard" | "advanced">("wizard");
  const [activeWorkflowFamily, setActiveWorkflowFamily] =
    useState<WorkflowFamilyId>("all");
  const [successSummary, setSuccessSummary] = useState<RunsSummary>({
    averageRating: null,
    keeperCount: 0,
    recentRunCount: 0,
    topNotes: [],
  });

  const workflow =
    promptWorkflows.find((candidate) => candidate.id === workflowId) ??
    defaultWorkflow;
  const localPrompt = workflow
    ? buildLocalPrompt(workflow, brief, parameterOverrides, successSummary)
    : null;
  const activeResult = result ?? localPrompt;

  const refreshMetrics = useCallback(async () => {
    if (!workflow) return;
    const query = `?workflowId=${encodeURIComponent(workflow.id)}`;
    try {
      const [runsResponse, presetsResponse] = await Promise.all([
        fetch(`/dashboard/tools/prompt-builder/runs${query}`),
        fetch(`/dashboard/tools/prompt-builder/presets${query}`),
      ]);
      const runsPayload = (await runsResponse.json()) as RunsPayload;
      const presetsPayload = (await presetsResponse.json()) as PresetsPayload;
      if (runsPayload.error) throw new Error(runsPayload.error);
      if (presetsPayload.error) throw new Error(presetsPayload.error);
      setMetricsAvailable(runsPayload.available && presetsPayload.available);
      setRuns(runsPayload.runs ?? []);
      setPresets(presetsPayload.presets ?? []);
      setSuccessSummary(runsPayload.summary);
    } catch {
      setMetricsAvailable(false);
      setRuns([]);
      setPresets([]);
      setSuccessSummary({
        averageRating: null,
        keeperCount: 0,
        recentRunCount: 0,
        topNotes: [],
      });
    }
  }, [workflow]);

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  function updateBrief<K extends keyof BriefState>(key: K, value: BriefState[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function applySubjectPreset(preset: Preset) {
    setBrief((current) => ({
      ...current,
      subjectPreset: preset.id,
      subject: preset.value,
    }));
    setResult(null);
  }

  function applySettingPreset(preset: Preset) {
    setBrief((current) => ({
      ...current,
      settingPreset: preset.id,
      scene: preset.value,
    }));
    setResult(null);
  }

  function applyLightingPreset(preset: Preset) {
    setBrief((current) => ({
      ...current,
      lightingPreset: preset.id,
      lighting: preset.value,
    }));
    setResult(null);
  }

  function applyCameraPreset(preset: Preset) {
    setBrief((current) => ({
      ...current,
      cameraPreset: preset.id,
      camera: preset.value,
    }));
    setResult(null);
  }

  function applySavedPreset(preset: PromptPresetSummary) {
    setBrief((current) => ({
      ...current,
      ...(preset.brief as Partial<BriefState>),
    }));
    setParameterOverrides(
      Object.fromEntries(
        Object.entries(preset.parameterOverrides).map(([key, value]) => [
          key,
          String(value ?? ""),
        ]),
      ),
    );
    setResult(null);
  }

  function toggleToken(token: string) {
    setBrief((current) => ({
      ...current,
      selectedTokens: current.selectedTokens.includes(token)
        ? current.selectedTokens.filter((item) => item !== token)
        : [...current.selectedTokens, token],
    }));
    setResult(null);
  }

  function updateParameterOverride(name: string, value: string) {
    setParameterOverrides((current) => ({
      ...current,
      [name]: value,
    }));
    setResult(null);
  }

  function selectWorkflow(nextWorkflowId: string) {
    setWorkflowId(nextWorkflowId);
    setParameterOverrides({});
    setResult(null);
  }

  async function optimize() {
    if (!workflow) return;
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/dashboard/tools/prompt-builder/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          workflow: {
            title: workflow.title,
            media: workflow.media,
            task: workflow.task,
            status: workflow.status,
            useWhen: workflow.useWhen,
            whyGood: workflow.whyGood,
            inputs: workflow.inputs,
            models: workflow.models,
            controlModels: workflow.controlModels,
            loras: workflow.loras,
            parameters: workflow.parameters,
            promptPreview: workflow.promptPreview,
            promptRecipe: workflow.promptRecipe,
            parameterGuidance: workflow.parameterGuidance,
            examplePrompts: workflow.examplePrompts,
          },
          brief,
          parameterOverrides,
          successContext: successSummary,
        }),
      });
      const payload = (await response.json()) as {
        result?: PromptBuilderOutput;
        error?: string;
        fallback?: boolean;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "Prompt generation failed.");
      }
      setResult(payload.result);
      if (payload.fallback) {
        setError("OpenAI optimization was unavailable, so the local workflow-aware fallback is shown.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prompt generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  if (!workflow || !activeResult) {
    return (
      <div className="border border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No prompt-capable workflows were found in the catalog.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Media Creation</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
              Prompt Lab
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Generate workflow-aware prompts from the current ComfyUI recipe map,
              then change one slot, setting, look, or parameter family at a time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{promptWorkflows.length} prompt workflows</Badge>
            <Badge variant={metricsAvailable === false ? "destructive" : "outline"}>
              {metricsAvailable === false ? "Metrics not installed" : "Supabase metrics"}
            </Badge>
          </div>
        </section>

        <WorkflowChooser
          workflows={promptWorkflows}
          activeWorkflowId={workflow.id}
          activeFamily={activeWorkflowFamily}
          onFamilyChange={setActiveWorkflowFamily}
          onWorkflowChange={selectWorkflow}
        />

        <section className="grid gap-4 border border-border/80 bg-card p-4">
          <WorkflowSummary workflow={workflow} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.8fr)]">
          <div className="grid gap-4">
            <section className="grid gap-4 border border-border/80 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-heading text-base font-semibold">Build prompt</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Use the wizard for the main creative choices. Open Advanced for exact slot text, tokens, parameters, and run tracking.
                  </p>
                </div>
                <div className="grid grid-cols-2 border border-border/80 bg-background p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={builderMode === "wizard" ? "default" : "ghost"}
                    onClick={() => setBuilderMode("wizard")}
                  >
                    Wizard
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={builderMode === "advanced" ? "default" : "ghost"}
                    onClick={() => setBuilderMode("advanced")}
                  >
                    Advanced
                  </Button>
                </div>
              </div>

              {builderMode === "wizard" ? (
                <div className="grid gap-5">
                  <div className="border border-border/70 bg-background p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={badgeClassForTag(taskLabel(workflow.task))}>
                        {taskLabel(workflow.task)}
                      </Badge>
                      <Badge variant="outline" className={badgeClassForTag(workflowRequirementLabel(workflow))}>
                        {workflowRequirementLabel(workflow)}
                      </Badge>
                      {workflowDimensions(workflow) ? (
                        <Badge variant="outline">{workflowDimensions(workflow)}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {workflowPromptHint(workflow)}
                    </p>
                  </div>

                  <PresetSelect
                    label="Setting"
                    presets={SETTING_PRESETS}
                    activeId={brief.settingPreset}
                    onApply={applySettingPreset}
                    emphasis
                  />

                  <div className="grid gap-4 md:grid-cols-3">
                    <PresetSelect
                      label="Subject / look"
                      presets={SUBJECT_PRESETS}
                      activeId={brief.subjectPreset}
                      onApply={applySubjectPreset}
                    />
                    <PresetSelect
                      label="Lighting"
                      presets={LIGHTING_PRESETS}
                      activeId={brief.lightingPreset}
                      onApply={applyLightingPreset}
                    />
                    <PresetSelect
                      label="Camera"
                      presets={CAMERA_PRESETS}
                      activeId={brief.cameraPreset}
                      onApply={applyCameraPreset}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <TextAreaField
                      label="Action / pose"
                      value={brief.action}
                      help="Action and expression. For OpenPose, let the reference image control body placement."
                      onChange={(value) => updateBrief("action", value)}
                    />
                    <TextAreaField
                      label="Composition"
                      value={brief.composition}
                      help="Crop, framing, camera distance, and full-body discipline."
                      onChange={(value) => updateBrief("composition", value)}
                    />
                    <TextAreaField
                      label="Style / finish"
                      value={brief.style}
                      help="Photorealism, texture, color grade, and render finish."
                      onChange={(value) => updateBrief("style", value)}
                    />
                    <TextAreaField
                      label="Negative additions"
                      value={brief.negativeAdditions}
                      rows={2}
                      help="Extra failure prevention for this run."
                      onChange={(value) => updateBrief("negativeAdditions", value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
                    <Button type="button" onClick={() => void optimize()} disabled={isGenerating}>
                      {isGenerating ? (
                        <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden />
                      ) : (
                        <SparklesIcon data-icon="inline-start" aria-hidden />
                      )}
                      Check with AI
                    </Button>
                    <CopyButton value={activeResult.positivePrompt} label="Copy Positive" />
                    <CopyButton value={activeResult.negativePrompt} label="Copy Negative" />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                <TextAreaField
                  label="Subject / look"
                  value={brief.subject}
                  help="Identity lane, visible adult presentation, body/look language, and styling."
                  onChange={(value) => updateBrief("subject", value)}
                />
                <TextAreaField
                  label="Setting"
                  value={brief.scene}
                  help="Location and environmental context. Change this to move from beach to coffee shop or boudoir without touching pose."
                  onChange={(value) => updateBrief("scene", value)}
                />
                <TextAreaField
                  label="Action / pose"
                  value={brief.action}
                  help="Action and expression. For OpenPose, let the reference image control body placement."
                  onChange={(value) => updateBrief("action", value)}
                />
                <TextAreaField
                  label="Composition"
                  value={brief.composition}
                  help="Crop, framing, camera distance, and full-body discipline."
                  onChange={(value) => updateBrief("composition", value)}
                />
                <TextAreaField
                  label="Lighting"
                  value={brief.lighting}
                  help="Light direction and mood. Often the easiest way to change output feel."
                  onChange={(value) => updateBrief("lighting", value)}
                />
                <TextAreaField
                  label="Camera"
                  value={brief.camera}
                  help="Lens, camera distance, and photographic language."
                  onChange={(value) => updateBrief("camera", value)}
                />
                <TextAreaField
                  label="Mood"
                  value={brief.mood}
                  help="Short emotional and editorial tone."
                  onChange={(value) => updateBrief("mood", value)}
                />
                <TextAreaField
                  label="Style / finish"
                  value={brief.style}
                  help="Photorealism, texture, color grade, and render finish."
                  onChange={(value) => updateBrief("style", value)}
                />
                  </div>
                  <TextAreaField
                    label="Constraints"
                    value={brief.constraints}
                    rows={2}
                    help="Safety and production constraints that should stay attached."
                    onChange={(value) => updateBrief("constraints", value)}
                  />
                  <TextAreaField
                    label="Negative additions"
                    value={brief.negativeAdditions}
                    rows={2}
                    help="Extra failure prevention for this run."
                    onChange={(value) => updateBrief("negativeAdditions", value)}
                  />
                  <div className="grid gap-4 border-t border-border/70 pt-4">
                    <TokenBank
                      label="Mood"
                      tokens={MOOD_TOKENS}
                      selected={brief.selectedTokens}
                      onToggle={toggleToken}
                    />
                    <TokenBank
                      label="Workflow control"
                      tokens={CONTROL_TOKENS}
                      selected={brief.selectedTokens}
                      onToggle={toggleToken}
                    />
                  </div>
                </div>
              )}
            </section>

            {builderMode === "advanced" ? (
              <section className="grid gap-4 lg:grid-cols-2">
                <KnownGoodPanel
                  summary={successSummary}
                  runs={runs}
                  presets={presets}
                  metricsAvailable={metricsAvailable}
                  onApplyPreset={applySavedPreset}
                />
                <ParameterPanel
                  workflow={workflow}
                  parameterOverrides={parameterOverrides}
                  onChange={updateParameterOverride}
                />
                <div className="lg:col-span-2">
                  <MetricsWriter
                    workflow={workflow}
                    brief={brief}
                    parameterOverrides={parameterOverrides}
                    activeResult={activeResult}
                    onSaved={refreshMetrics}
                  />
                </div>
              </section>
            ) : null}
          </div>

          <PromptOutputPanel
            activeResult={activeResult}
            result={result}
            error={error}
            isGenerating={isGenerating}
            onOptimize={() => void optimize()}
          />
        </section>
      </div>
    </TooltipProvider>
  );
}
