import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  PromptBuilderOutputSchema,
  type PromptBuilderOutput,
  type PromptBuilderRequest,
} from "@/lib/prompt-builder/schema";

export const PROMPT_BUILDER_MODEL =
  process.env.OPENAI_PROMPT_BUILDER_MODEL?.trim() || "gpt-5.5";

const REQUIRED_BOUNDARY = [
  "Use only clearly adult, fictional, consented, non-public-figure subjects.",
  "Do not create or imply minors, youth-coded subjects, celebrities, public figures, face swaps, private real-person likenesses without consent, coercion, voyeurism, humiliation, or explicit sexual action framing.",
  "Keep positive prompts aligned to tasteful editorial, fine-art, documentary, fashion, or continuity language.",
  "Put exclusions and failure prevention in the negative prompt rather than adding disallowed concepts to the positive prompt.",
];

function joinParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean)
    .join(", ");
}

function stringValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "not extracted";
  return String(value);
}

function truncate(input: string, max: number) {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}...`;
}

function workflowControl(input: PromptBuilderRequest) {
  const { task } = input.workflow;
  if (task === "openpose") {
    return "follow the OpenPose reference for pose and body placement, preserve head-to-feet framing, both hands and feet visible";
  }
  if (task === "img2img") {
    return "preserve the source image identity, composition, and lighting while making one controlled global change";
  }
  if (task === "inpaint") {
    return "edit only the masked area, preserve surrounding pixels, match source lighting and perspective";
  }
  if (task === "i2v") {
    return "preserve identity and anatomy from the accepted source keyframe with subtle controlled natural motion";
  }
  if (task === "first-last-frame") {
    return "preserve continuity between the start frame and end frame with a small coherent transition";
  }
  return input.workflow.promptRecipe.lockedClauses.join(", ");
}

function buildPromptSections(input: PromptBuilderRequest): PromptBuilderOutput["promptSections"] {
  const { brief, workflow } = input;
  return [
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
      text: workflowControl(input),
      locked: true,
      source: "workflow" as const,
    },
    {
      id: "safety",
      label: "Safety constraints",
      text: brief.constraints || REQUIRED_BOUNDARY.join(" "),
      locked: true,
      source: "safety" as const,
    },
  ].filter((section) => section.text.trim());
}

function suggestedParameters(
  input: PromptBuilderRequest,
): PromptBuilderOutput["suggestedParameters"] {
  return input.workflow.parameterGuidance.slice(0, 8).map((item) => {
    const override = input.parameterOverrides[item.name]?.trim();
    return {
      name: item.name,
      currentValue: stringValue(item.currentValue),
      suggestedValue: override || stringValue(item.currentValue),
      recommendedRange: item.recommendedRange,
      reason: item.effect,
      risk: item.warning,
    };
  });
}

function fitChecks(input: PromptBuilderRequest): PromptBuilderOutput["fitChecks"] {
  const { workflow, brief } = input;
  const sections = buildPromptSections(input);
  const positiveText = sections.map((section) => section.text).join(" ").toLowerCase();
  const hasFullBody = /full[- ]?body|head-to-feet|hands and feet/.test(positiveText);
  const hasSourcePreservation = /preserve|same source|continuity|masked/.test(positiveText);
  return [
    {
      label: "Workflow mode",
      status: workflow.task === "reference" ? "review" : "pass",
      detail: `${workflow.task} prompt structure is active.`,
    },
    {
      label: "Required inputs",
      status: workflow.inputs.length ? "pass" : "review",
      detail: workflow.inputs.length
        ? workflow.inputs.join(", ")
        : "No required inputs were extracted.",
    },
    {
      label: "OpenPose framing",
      status: workflow.task === "openpose" ? (hasFullBody ? "pass" : "review") : "pass",
      detail:
        workflow.task === "openpose"
          ? "OpenPose prompts should keep full-body framing explicit."
          : "Not an OpenPose workflow.",
    },
    {
      label: "Source preservation",
      status: ["img2img", "inpaint", "i2v", "first-last-frame"].includes(workflow.task)
        ? hasSourcePreservation
          ? "pass"
          : "review"
        : "pass",
      detail: "Source-guided modes need preservation or continuity language.",
    },
    {
      label: "Known-good context",
      status: input.successContext.recentRunCount > 0 ? "pass" : "review",
      detail:
        input.successContext.recentRunCount > 0
          ? `${input.successContext.recentRunCount} saved run(s), ${input.successContext.keeperCount} keeper(s).`
          : "No saved Supabase success metrics for this workflow yet.",
    },
    {
      label: "Adult-only boundary",
      status: /adult|mature/.test(brief.subject.toLowerCase()) ? "pass" : "review",
      detail: "Subject language should remain clearly adult, fictional, and non-public-figure.",
    },
  ];
}

export function buildLocalPromptBuilderOutput(
  input: PromptBuilderRequest,
  warnings: string[] = [],
): PromptBuilderOutput {
  const sections = buildPromptSections(input);
  const positivePrompt = truncate(joinParts([
    ...sections
      .filter((section) => section.id !== "safety")
      .map((section) => section.text),
    ...input.brief.selectedTokens,
  ]), 2600);
  const negativePrompt = truncate(joinParts([
    ...input.workflow.promptRecipe.negativeBase,
    input.workflow.promptPreview.negative,
    input.brief.negativeAdditions,
  ]), 2000);
  const parameterSuggestions = suggestedParameters(input);

  return {
    positivePrompt,
    negativePrompt,
    promptSections: sections,
    suggestedParameters: parameterSuggestions,
    workflowNotes: [
      `Mode: ${input.workflow.task}.`,
      input.workflow.useWhen,
      input.workflow.whyGood,
      ...input.workflow.promptRecipe.promptNotes.slice(0, 3),
    ].slice(0, 8).map((note) => truncate(note, 240)),
    variants: [
      {
        label: "Setting swap",
        positivePrompt: truncate(joinParts([
          input.brief.subject,
          "same pose/framing structure",
          input.brief.scene,
          input.brief.lighting,
          workflowControl(input),
          input.brief.style,
        ]), 2200),
        reason: "Changes setting or light while preserving workflow control clauses.",
      },
      {
        label: "Conservative test",
        positivePrompt: truncate(joinParts([
          positivePrompt,
          "small controlled variation, keep known-good workflow parameters stable",
        ]), 2200),
        reason: "Best for apples-to-apples workflow comparisons.",
      },
    ],
    fitChecks: fitChecks(input),
    warnings,
  };
}

function buildSystemPrompt() {
  return `You are the Crashboard Media Creation prompt engineer.

You generate ComfyUI-ready prompts for the selected workflow, using the workflow's actual constraints.

Rules:
- Respect the workflow mode, inputs, models, ControlNets, LoRAs, and why it worked.
- Preserve prompt structure that fits the workflow: subject, scene, action, composition, light, camera, realism/style, workflow control details.
- For OpenPose, explicitly mention following the pose/reference and preserving full-body framing when relevant.
- For img2img, inpaint, first/last-frame, and video, emphasize preservation, continuity, denoise/locality, and stable identity/composition as appropriate.
- For I2V/video, keep the prompt concise and motion-oriented; avoid overloading with still-image detail.
- Use promptSections to show which parts are editable and which are locked workflow/safety clauses.
- Use suggestedParameters to explain the best parameter values/ranges, not to invent unsupported graph settings.
- Use fitChecks to call out whether the prompt fits the selected workflow mode and required inputs.
- Avoid generic prompt stuffing. Keep one strong prompt that can be edited by hand.
- Return structured output only.

Safety/content boundary:
${REQUIRED_BOUNDARY.map((rule) => `- ${rule}`).join("\n")}`;
}

function buildUserPayload(input: PromptBuilderRequest) {
  return JSON.stringify(
    {
      selectedWorkflow: input.workflow,
      userBrief: input.brief,
      outputRequirements: {
        positivePrompt:
          "One clean production prompt tailored to the workflow and user controls.",
        negativePrompt:
          "A practical negative prompt combining workflow failure prevention, safety exclusions, and user negative additions.",
        promptSections:
          "Break the positive prompt into editable sections. Mark workflow-control and safety sections as locked.",
        suggestedParameters:
          "Use actual extracted parameter guidance and user overrides. Explain what to keep stable and what to adjust.",
        workflowNotes:
          "Short notes about why the prompt fits this workflow and what to keep stable.",
        variants:
          "1-4 smaller positive-prompt variants that change one useful axis at a time.",
        fitChecks:
          "Pass/review/missing checks for OpenPose/source preservation/adult boundary/known-good context.",
      },
    },
    null,
    2,
  );
}

export async function generatePromptBuilderOutput(
  input: PromptBuilderRequest,
  options: { client: OpenAI; model?: string },
): Promise<PromptBuilderOutput> {
  const response = await options.client.responses.parse({
    model: options.model ?? PROMPT_BUILDER_MODEL,
    input: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPayload(input) },
    ],
    text: {
      format: zodTextFormat(PromptBuilderOutputSchema, "prompt_builder_output"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI response did not include parsed prompt output.");
  }

  return response.output_parsed;
}
