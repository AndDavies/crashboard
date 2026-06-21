import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

type WorkflowTask =
  | "text2img"
  | "openpose"
  | "img2img"
  | "inpaint"
  | "upscale-export"
  | "i2v"
  | "first-last-frame"
  | "interpolation"
  | "reference";

type WorkflowEntry = {
  id: string;
  title: string;
  path: string;
  cloudPath: string | null;
  media: "still" | "video";
  status: string;
  task: WorkflowTask;
  sourceSet: "proven" | "good" | "favourites" | "runpod-smoke" | "reference";
  useWhen: string;
  whyGood: string;
  whatWorked: string[];
  inputs: string[];
  models: string[];
  controlModels: string[];
  loras: string[];
  imageInputs: string[];
  parameters: Record<string, string | number | boolean>;
  promptPreview: {
    positive: string | null;
    negative: string | null;
  };
  promptRecipe: WorkflowPromptRecipe;
  parameterGuidance: WorkflowParameterGuidance[];
  examplePrompts: WorkflowExamplePrompt[];
  notes: string[];
};

type PromptNode = {
  label: string;
  text: string;
};

type WorkflowPromptSlot = {
  id:
    | "subject"
    | "setting"
    | "action"
    | "composition"
    | "lighting"
    | "camera"
    | "style"
    | "constraints";
  label: string;
  defaultValue: string;
  help: string;
  examples: string[];
};

type WorkflowPromptRecipe = {
  scaffold: string[];
  slots: WorkflowPromptSlot[];
  lockedClauses: string[];
  negativeBase: string[];
  promptNotes: string[];
};

type WorkflowParameterGuidance = {
  name: string;
  currentValue: string | number | boolean | null;
  recommendedRange: string;
  effect: string;
  increaseEffect: string;
  decreaseEffect: string;
  warning: string;
  example: string;
};

type WorkflowExamplePrompt = {
  label: string;
  positive: string;
  negative: string | null;
  parameters: Record<string, string | number | boolean>;
  sourcePath: string;
  note: string;
};

const MEDIA_ROOT =
  process.env.MEDIA_CREATION_ROOT?.trim() ||
  "/Users/andrewdavies/Documents/Media Creation";
const PROJECT_ROOT = process.cwd();
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "src/content/media-workflows/generated/reference.json",
);

const WORKFLOW_DIRS = [
  "04_Workflows/Proven_Workflows",
  "04_Workflows/Still_Image/Good",
  "04_Workflows/Video/Good",
  "04_Workflows/Favourites",
  "13_RunPod_Pilot/outputs",
];

const CURATED: Record<
  string,
  Partial<Pick<WorkflowEntry, "useWhen" | "whyGood" | "whatWorked" | "inputs" | "notes">>
> = {
  "sdxl-photoreal-openpose-production-current-v18-api.json": {
    useWhen: "Default production still when pose discipline and full-body framing matter.",
    whyGood:
      "Validated current one-file still workflow: Juggernaut XL, low-strength Canopus realism LoRA, strong SDXL OpenPose control, full-body framing.",
    whatWorked: [
      "OpenPose kept crown-to-feet composition stable.",
      "ControlNet strength 0.82 preserved pose without fully freezing the image.",
      "Juggernaut v9 plus Canopus kept the selected local identity and realism lane consistent.",
    ],
    inputs: ["Positive prompt", "Negative prompt", "Full-body OpenPose reference"],
  },
  "sdxl-master-openpose-keyframe-recommended-v03-ui.json": {
    useWhen: "Manual ComfyUI keyframe generation before video.",
    whyGood:
      "Main UI keyframe generator for controlled SDXL stills with strict OpenPose framing.",
    whatWorked: [
      "UI graph is easier to inspect and adjust before queueing API runs.",
      "The pose image is explicitly labelled for swapping.",
    ],
  },
  "sdxl-master-openpose-keyframe-recommended-v03-api.json": {
    useWhen: "Queueable/API version of the main still keyframe workflow.",
    whyGood: "Same production posture as the UI keyframe workflow in a repeatable API graph.",
  },
  "sdxl-text-only-full-body-fallback-current-v02-ui.json": {
    useWhen: "ControlNet is unavailable or too slow and a prompt-only full-body fallback is acceptable.",
    whyGood: "Keeps the SDXL/Canopus still lane available without image inputs.",
    whatWorked: ["Useful smoke test because it removes OpenPose and input-image dependencies."],
    inputs: ["Positive prompt", "Negative prompt"],
  },
  "sdxl-text-only-face-portrait-current-v02-ui.json": {
    useWhen: "Face or portrait realism is more important than head-to-feet framing.",
    whyGood: "Focused portrait lane for realistic face texture without full-body composition pressure.",
  },
  "sdxl-img2img-source-modify-juggernaut-current-v02-ui.json": {
    useWhen: "Starting from an existing still and making a controlled global modification.",
    whyGood: "General source-guided edit lane using the same Juggernaut SDXL family.",
    inputs: ["Source image", "Positive prompt", "Negative prompt", "Denoise setting"],
  },
  "sdxl-masked-repair-lustify-recommended-v03-ui.json": {
    useWhen: "Repair a local defect with a tight mask after a strong keyframe exists.",
    whyGood: "Uses Lustify SDXL inpainting as a local repair tool instead of rerunning the full image.",
    whatWorked: ["Tight masks and local prompts preserve the accepted keyframe."],
    inputs: ["Source image", "Mask image", "Local repair prompt"],
  },
  "sdxl-tight-skin-tone-cleanup-recommended-v03-ui.json": {
    useWhen: "Subtle color, texture, or skin-tone cleanup without changing identity.",
    whyGood: "Low-denoise cleanup lane for preserving lighting and identity.",
  },
  "still-keyframe-lanczos-2x-clean-export-recommended-v09-api.json": {
    useWhen: "Create a clean 2x export master without generative changes.",
    whyGood: "Deterministic export path that replaced a rejected generative upscale with striping.",
    inputs: ["Accepted keyframe image"],
  },
  "sdxl-authored-end-keyframe-img2img-recommended-v13-api.json": {
    useWhen: "Author a small endpoint variation for first/last-frame video.",
    whyGood: "Creates continuity-friendly end frames while preserving subject, framing, and light.",
    inputs: ["Accepted source keyframe", "Endpoint variation prompt"],
  },
  "sdxl-close-end-keyframe-img2img-reference-v15-api.json": {
    useWhen: "Create a minimal endpoint delta for continuity experiments.",
    whyGood: "Useful reference lane when FLF tests need less movement between start and end frames.",
  },
  "wan22-gguf-camera-i2v-rife2x-production-current-v19-api.json": {
    useWhen: "Default production short video from an accepted still.",
    whyGood:
      "Current production video graph: Wan GGUF camera I2V at full-body framing plus direct RIFE 2x smoothing.",
    whatWorked: [
      "224 x 528 preserved full-body framing better than the rejected 256 x 448 graph.",
      "Wan camera conditioning produced visible controlled motion.",
      "RIFE smoothing produced the selected local short-video proof.",
    ],
    inputs: ["Accepted source keyframe", "Concise continuity prompt"],
  },
  "wan22-gguf-camera-i2v-rife2x-length-expansion-proof-v20-api.json": {
    useWhen: "Validated longer sample when runtime is acceptable.",
    whyGood:
      "Same v19 stack with 25 raw Wan frames and 49 RIFE-smoothed frames for length expansion proof.",
    whatWorked: ["Proved longer output at the same full-body framing without changing the stack."],
  },
  "wan22-gguf-camera-i2v-17-frame-longer-proof-v10-api.json": {
    useWhen: "Reproduce the older 17-frame camera-conditioned Wan baseline before smoothing.",
    whyGood: "Accepted visible-motion baseline for comparison against the combined v19 graph.",
  },
  "rife-2x-smooth-v10-17-frame-best-local-video-v11-api.json": {
    useWhen: "Smooth an already accepted v10 17-frame clip without rerunning Wan.",
    whyGood: "Best local interpolation-only baseline for the accepted older clip.",
    inputs: ["Accepted MP4 clip"],
  },
  "wan22-gguf-authored-first-last-frame-continuity-v14-api.json": {
    useWhen: "Use authored start and end keyframes for first/last-frame continuity.",
    whyGood: "Selected short FLF proof with less collapse than the sampled v12 path.",
    inputs: ["Start keyframe", "Authored end keyframe", "Continuity prompt"],
  },
  "Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_api.json": {
    useWhen: "Current best Avery yoga branch in API form.",
    whyGood: "Favourites current-best branch using OpenPose with NudeXL and Canopus realism support.",
    whatWorked: [
      "NudeXL plus Canopus improved the yoga branch locally.",
      "Kept pose control while pushing the visual style closer to the selected branch.",
    ],
  },
  "Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_ui.json": {
    useWhen: "Inspect or modify the current best Avery yoga branch manually in ComfyUI.",
    whyGood: "UI twin of the current-best favourite for drag-and-drop use on the pod.",
  },
  "Avery_Yoga_08_CurrentBest_IPA_Img2Img_w035_d180_api.json": {
    useWhen: "Low-denoise identity polish after a strong yoga base image is selected.",
    whyGood: "Favourites README calls this the identity polish lane for the current yoga branch.",
  },
  "openpose_field_boudoir_cyber_nudexl_no_canopus_TRY_THIS_ONE_api.json": {
    useWhen: "Start here for the accepted soft outdoor field/blanket boudoir look.",
    whyGood:
      "User-liked AC branch using CyberRealisticXLPlay with NudeXL and no Canopus. It produced the softer outdoor mood that became the accepted field lane.",
    whatWorked: [
      "CyberRealisticXLPlay gave the warmer field mood and softer body rendering.",
      "NudeXL at 0.46 gave adult fine-art nude output without the heavier Canopus styling.",
      "OpenPose strength 0.76 to 0.88 kept the top-down blanket pose coherent.",
    ],
    inputs: ["Positive prompt", "Negative prompt", "OpenPose reference image"],
    notes: [
      "Best for the original AC look.",
      "Use a different arched-pose workflow when a visible back arch matters.",
    ],
  },
  "openpose_field_arch_boudoir_cyber_nudexl_ACCEPTED_K_api.json": {
    useWhen: "Use for the accepted arched-back field-boudoir direction.",
    whyGood:
      "Accepted K branch: same Cyber/NudeXL field style, but using the padded supine-arched OpenPose reference to make the arched body line readable.",
    whatWorked: [
      "The padded arched OpenPose reference improved the body-line read compared with the original top-down butterfly pose.",
      "CyberRealisticXLPlay plus NudeXL 0.38 kept the accepted outdoor mood while reducing overpressure.",
      "OpenPose strength 0.88 to 0.94 gave stronger pose obedience for the arched reference.",
    ],
    inputs: ["Positive prompt", "Negative prompt", "Padded arched OpenPose reference image"],
    notes: [
      "Accepted candidate, not a universal fix for feet or lower-body geometry.",
      "If the pose is good but the image needs polish, use the matching K img2img workflow.",
    ],
  },
  "img2img_field_arch_boudoir_K_realism_polish_d140_ACCEPTED_api.json": {
    useWhen: "Polish the accepted K arched-field output without changing composition.",
    whyGood:
      "Low-denoise source-preserving pass from K that slightly improves softness and photo finish while keeping the same field composition.",
    whatWorked: [
      "Denoise 0.14 preserved the selected source image.",
      "NudeXL strength 0.22 reduced drift while maintaining the accepted adult fine-art style.",
      "CyberRealisticXLPlay kept the K branch visually consistent.",
    ],
    inputs: ["Accepted K source image", "Positive prompt", "Negative prompt", "Denoise setting"],
    notes: [
      "Use only after the K OpenPose output is already close.",
      "It will not reveal hidden feet or repair major pose geometry.",
    ],
  },
};

function slug(input: string) {
  return input
    .replace(/\.json$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function titleFromFile(fileName: string) {
  return fileName
    .replace(/\.json$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(api|ui|sdxl|i2v|flf|gguf|rife|ipa|vfi)\b/gi, (match) =>
      match.toUpperCase(),
    )
    .replace(/\bv(\d+)\b/gi, "v$1")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walk(fullPath);
    return entry.endsWith(".json") ? [fullPath] : [];
  });
}

function readJson(filePath: string): unknown | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function truncate(input: string | null | undefined, max = 260) {
  if (!input) return null;
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const cut = normalized.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trim()}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectFromWorkflow(json: unknown) {
  const prompts: PromptNode[] = [];
  const imageInputs = new Set<string>();
  const models = new Set<string>();
  const controlModels = new Set<string>();
  const loras = new Set<string>();
  const parameters: Record<string, string | number | boolean> = {};

  const rawRoot = asRecord(json);
  const apiPromptRoot = asRecord(rawRoot.prompt);
  const root = Array.isArray(rawRoot.nodes) || Object.keys(apiPromptRoot).length === 0
    ? rawRoot
    : apiPromptRoot;
  const nodes = Array.isArray(root.nodes) ? root.nodes : null;

  if (nodes) {
    for (const rawNode of nodes) {
      const node = asRecord(rawNode);
      const type = stringValue(node.type) ?? "";
      const title = stringValue(node.title) ?? type;
      const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];
      if (type.includes("CLIPTextEncode") && typeof widgets[0] === "string") {
        prompts.push({ label: title, text: widgets[0] });
      }
      if (type === "LoadImage" && typeof widgets[0] === "string") {
        imageInputs.add(widgets[0]);
      }
      if (type === "CheckpointLoaderSimple" && typeof widgets[0] === "string") {
        models.add(widgets[0]);
      }
      if (type === "ControlNetLoader" && typeof widgets[0] === "string") {
        controlModels.add(widgets[0]);
      }
      if (type === "LoraLoader" && typeof widgets[0] === "string") {
        loras.add(widgets[0]);
        if (typeof widgets[1] === "number") parameters.lora_strength_model = widgets[1];
        if (typeof widgets[2] === "number") parameters.lora_strength_clip = widgets[2];
      }
      if (type.includes("ControlNetApply")) {
        if (typeof widgets[0] === "number") parameters.control_strength = widgets[0];
        if (typeof widgets[1] === "number") parameters.control_start = widgets[1];
        if (typeof widgets[2] === "number") parameters.control_end = widgets[2];
      }
      if (type === "EmptyLatentImage") {
        if (typeof widgets[0] === "number") parameters.width = widgets[0];
        if (typeof widgets[1] === "number") parameters.height = widgets[1];
      }
      if (type === "KSampler") {
        if (typeof widgets[2] === "number") parameters.steps = widgets[2];
        if (typeof widgets[3] === "number") parameters.cfg = widgets[3];
        if (typeof widgets[4] === "string") parameters.sampler = widgets[4];
        if (typeof widgets[5] === "string") parameters.scheduler = widgets[5];
        if (typeof widgets[6] === "number") parameters.denoise = widgets[6];
      }
    }
  } else {
    for (const [nodeId, rawNode] of Object.entries(root)) {
      const node = asRecord(rawNode);
      const classType = stringValue(node.class_type) ?? "";
      const title = stringValue(asRecord(node._meta).title) ?? (classType || nodeId);
      const inputs = asRecord(node.inputs);
      const text = stringValue(inputs.text);
      if (classType.includes("CLIPTextEncode") && text) {
        prompts.push({ label: title, text });
      }
      const image = stringValue(inputs.image);
      if (classType === "LoadImage" && image) imageInputs.add(image);
      const ckpt = stringValue(inputs.ckpt_name);
      if (ckpt) models.add(ckpt);
      const control = stringValue(inputs.control_net_name);
      if (control) controlModels.add(control);
      const lora = stringValue(inputs.lora_name);
      if (lora) {
        loras.add(lora);
        if (typeof inputs.strength_model === "number") {
          parameters.lora_strength_model = inputs.strength_model;
        }
        if (typeof inputs.strength_clip === "number") {
          parameters.lora_strength_clip = inputs.strength_clip;
        }
      }
      if (classType.includes("ControlNetApply")) {
        if (typeof inputs.strength === "number") parameters.control_strength = inputs.strength;
        if (typeof inputs.start_percent === "number") parameters.control_start = inputs.start_percent;
        if (typeof inputs.end_percent === "number") parameters.control_end = inputs.end_percent;
      }
      for (const key of [
        "seed",
        "width",
        "height",
        "batch_size",
        "steps",
        "cfg",
        "sampler_name",
        "scheduler",
        "denoise",
        "frame_rate",
        "fps",
        "length",
      ]) {
        const value = inputs[key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          const outKey = key === "sampler_name" ? "sampler" : key;
          parameters[outKey] = value;
        }
      }
    }
  }

  const positive =
    prompts.find((prompt) => /positive/i.test(prompt.label)) ??
    prompts.find((prompt) => !/negative|minor, teen|watermark, text, logo/i.test(prompt.text)) ??
    prompts[0];
  const negative =
    prompts.find((prompt) => /negative/i.test(prompt.label)) ??
    prompts.find((prompt) => /minor, teen|watermark, text, logo|bad anatomy/i.test(prompt.text));

  return {
    models: [...models].sort(),
    controlModels: [...controlModels].sort(),
    loras: [...loras].sort(),
    imageInputs: [...imageInputs].sort(),
    parameters,
    promptPreview: {
      positive: truncate(positive?.text),
      negative: truncate(negative?.text),
    },
  };
}

function inferMedia(relativePath: string): "still" | "video" {
  const lower = relativePath.toLowerCase();
  return lower.includes("/video/") ||
    lower.includes("wan22") ||
    lower.includes("rife") ||
    lower.includes("i2v")
    ? "video"
    : "still";
}

function inferTask(relativePath: string): WorkflowTask {
  const lower = relativePath.toLowerCase();
  if (lower.includes("rife") || lower.includes("smooth") || lower.includes("vfi")) {
    return "interpolation";
  }
  if (lower.includes("first-last") || lower.includes("flf")) return "first-last-frame";
  if (lower.includes("i2v") || lower.includes("wan22") || lower.includes("camera")) return "i2v";
  if (lower.includes("inpaint") || lower.includes("repair") || lower.includes("mask")) return "inpaint";
  if (
    lower.includes("img2img") ||
    lower.includes("source-modify") ||
    lower.includes("refine") ||
    lower.includes("ipa") ||
    lower.includes("cropuncrop") ||
    lower.includes("end-keyframe")
  ) {
    return "img2img";
  }
  if (lower.includes("upscale") || lower.includes("lanczos") || lower.includes("export")) {
    return "upscale-export";
  }
  if (lower.includes("openpose") || lower.includes("pose-control") || lower.includes("control")) {
    return "openpose";
  }
  if (lower.includes("text-only") || lower.includes("textonly")) return "text2img";
  return "reference";
}

function inferStatus(relativePath: string) {
  const lower = relativePath.toLowerCase();
  if (lower.includes("13_runpod_pilot/outputs")) return "pod smoke output";
  if (lower.includes("04_workflows/proven_workflows")) return "proven working set";
  if (lower.includes("/00_current_best/")) return "current best favourite";
  if (lower.includes("/95_video/")) return "video favourite";
  if (lower.includes("/90_templates/")) return "template";
  if (lower.includes("/02_refinement_candidates/")) return "refinement candidate";
  if (lower.includes("/03_repair_and_detail/")) return "repair/detail candidate";
  if (lower.includes("/04_user_liked_downloads/")) return "user-liked import";
  if (lower.includes("/bad/")) return "reference only";
  if (lower.includes("/good/")) return "current good";
  return "catalogued";
}

function sourceSet(relativePath: string): WorkflowEntry["sourceSet"] {
  const lower = relativePath.toLowerCase();
  if (lower.includes("04_workflows/proven_workflows")) return "proven";
  if (lower.includes("13_runpod_pilot/outputs")) return "runpod-smoke";
  if (lower.includes("04_workflows/favourites")) return "favourites";
  if (lower.includes("/bad/")) return "reference";
  return "good";
}

function defaultInputs(task: WorkflowTask, extractedImages: string[]) {
  if (task === "text2img") return ["Positive prompt", "Negative prompt"];
  if (task === "openpose") return ["Positive prompt", "Negative prompt", "OpenPose reference image"];
  if (task === "img2img") return ["Source image", "Positive prompt", "Negative prompt", "Denoise setting"];
  if (task === "inpaint") return ["Source image", "Mask image", "Local edit prompt"];
  if (task === "upscale-export") return ["Accepted source image"];
  if (task === "interpolation") return ["Accepted video clip or frame sequence"];
  if (task === "first-last-frame") return ["Start frame", "End frame", "Continuity prompt"];
  if (task === "i2v") return ["Accepted source keyframe", "Continuity/motion prompt"];
  return extractedImages.length ? ["Workflow-specific image inputs"] : ["Workflow-specific inputs"];
}

const BASE_NEGATIVE = [
  "minor",
  "teen",
  "child",
  "youth-coded",
  "celebrity",
  "public figure",
  "real person likeness",
  "face swap",
  "coercive scene",
  "voyeuristic scene",
  "humiliation",
  "explicit sexual action",
  "other people",
  "watermark",
  "text",
  "logo",
  "bad anatomy",
  "extra limbs",
  "bad hands",
  "bad feet",
  "distorted face",
  "plastic skin",
  "blurry",
  "low resolution",
];

const SLOT_LIBRARY: Record<WorkflowPromptSlot["id"], WorkflowPromptSlot> = {
  subject: {
    id: "subject",
    label: "Subject / look",
    defaultValue: "fictional clearly adult editorial subject with mature styling",
    help: "Controls identity lane, age presentation, body type, styling, and the model/look language without changing workflow mechanics.",
    examples: [
      "fictional clearly adult girl-next-door fashion subject, late-20s or older styling",
      "fictional mature hipster editorial woman with layered casual styling",
      "fictional rubenesque mature woman with tasteful fashion styling",
    ],
  },
  setting: {
    id: "setting",
    label: "Setting",
    defaultValue: "clean editorial environment with uncluttered background separation",
    help: "Changes location and environmental context; keep it concise so pose/control inputs still dominate structure.",
    examples: [
      "secluded beach at golden hour",
      "cozy coffee shop corner with warm window light",
      "low-key boudoir interior with tasteful directional light",
    ],
  },
  action: {
    id: "action",
    label: "Action / pose",
    defaultValue: "calm controlled pose with natural expression",
    help: "Describes what the subject is doing; OpenPose workflows should defer body placement to the reference image.",
    examples: [
      "standing naturally with relaxed shoulders",
      "seated with a calm direct expression",
      "subtle hair and posture movement for video",
    ],
  },
  composition: {
    id: "composition",
    label: "Composition",
    defaultValue: "stable full-body composition with clean head-to-feet framing",
    help: "Controls crop, distance, body framing, and camera placement; this is critical for full-body/OpenPose work.",
    examples: [
      "vertical head-to-toe long shot",
      "medium-full editorial portrait with room around the subject",
      "full-body frame, both hands and feet visible",
    ],
  },
  lighting: {
    id: "lighting",
    label: "Lighting",
    defaultValue: "soft natural light with realistic skin highlights",
    help: "Changes mood and realism without changing the workflow graph. Strong lighting phrases often have more impact than extra style tags.",
    examples: [
      "golden-hour side light",
      "warm coffee shop window glow",
      "low-key interior light with subtle rim separation",
    ],
  },
  camera: {
    id: "camera",
    label: "Camera",
    defaultValue: "50mm real camera photograph, natural depth of field",
    help: "Controls lens feel, distance, and photographic language; use one camera idea at a time.",
    examples: [
      "50mm documentary photograph",
      "85mm shallow depth of field",
      "camera pulled back, stable full-body framing",
    ],
  },
  style: {
    id: "style",
    label: "Style / finish",
    defaultValue: "photorealistic, natural skin texture, restrained color grade",
    help: "Controls render finish. Keep it realistic and restrained for Juggernaut/Canopus lanes.",
    examples: [
      "photorealistic editorial fashion finish",
      "documentary realism with restrained color grade",
      "fine-art natural skin texture",
    ],
  },
  constraints: {
    id: "constraints",
    label: "Constraints",
    defaultValue:
      "lawful, fictional, clearly adult, consented, non-celebrity, non-public-figure, non-coercive, non-explicit-action",
    help: "Safety and production guardrails that should stay attached to every generated prompt.",
    examples: [
      "fictional adult-only subject",
      "no public figure or real-person likeness",
      "non-explicit editorial framing",
    ],
  },
};

function promptScaffoldFor(task: WorkflowTask) {
  if (task === "i2v" || task === "first-last-frame") {
    return [
      "source continuity",
      "subject identity",
      "setting continuity",
      "small motion",
      "camera motion",
      "stability constraints",
    ];
  }
  if (task === "inpaint") {
    return [
      "source preservation",
      "masked-area edit",
      "local anatomy/material description",
      "lighting match",
      "edge/blend constraints",
    ];
  }
  return [
    "subject identity",
    "setting",
    "pose/action",
    "composition",
    "lighting",
    "camera",
    "realism/style",
    "workflow control",
  ];
}

function lockedClausesFor(task: WorkflowTask, parameters: Record<string, string | number | boolean>) {
  const clauses: string[] = [];
  if (task === "openpose") {
    clauses.push(
      "follow the OpenPose reference for pose and body placement",
      "keep head-to-feet full-body framing with both hands and feet in frame",
      "let the prompt change setting, styling, lighting, and camera while the reference controls body geometry",
    );
  }
  if (task === "img2img") {
    clauses.push(
      "preserve the source image identity, composition, and lighting",
      "make one controlled global change at a time",
    );
  }
  if (task === "inpaint") {
    clauses.push(
      "edit only the masked area",
      "match the source image lighting, skin tone, perspective, and edges",
    );
  }
  if (task === "i2v") {
    clauses.push(
      "preserve identity and anatomy from the accepted source keyframe",
      "use subtle controlled motion rather than a dense still-image prompt",
    );
  }
  if (task === "first-last-frame") {
    clauses.push(
      "preserve continuity between the start and end frames",
      "describe the smallest useful transition rather than a new scene",
    );
  }
  if (typeof parameters.denoise === "number" && parameters.denoise < 0.4) {
    clauses.push("keep denoise low enough to preserve the selected source image");
  }
  return clauses;
}

function promptNotesFor(task: WorkflowTask) {
  if (task === "openpose") {
    return [
      "OpenPose controls body placement; the prompt still controls setting, lighting, styling, realism, and camera language.",
      "If the pose is good but the look is wrong, change subject/setting/lighting first before changing ControlNet strength.",
    ];
  }
  if (task === "img2img") {
    return [
      "Lower denoise preserves more of the source; higher denoise allows stronger changes but risks identity drift.",
      "Use one visual change per run when comparing outputs.",
    ];
  }
  if (task === "inpaint") {
    return [
      "A tight mask and local prompt are more important than a long global prompt.",
      "If edges smear or identity changes, lower denoise or make the mask smaller.",
    ];
  }
  if (task === "i2v" || task === "first-last-frame") {
    return [
      "Video prompts should be concise, continuity-first, and motion-oriented.",
      "Accepted stills matter more than adding more prompt detail.",
    ];
  }
  return [
    "Keep the subject, setting, composition, lighting, camera, and style clauses distinct so individual changes are easy to test.",
  ];
}

function promptRecipeFor(task: WorkflowTask, parameters: Record<string, string | number | boolean>) {
  return {
    scaffold: promptScaffoldFor(task),
    slots: [
      SLOT_LIBRARY.subject,
      SLOT_LIBRARY.setting,
      SLOT_LIBRARY.action,
      SLOT_LIBRARY.composition,
      SLOT_LIBRARY.lighting,
      SLOT_LIBRARY.camera,
      SLOT_LIBRARY.style,
      SLOT_LIBRARY.constraints,
    ],
    lockedClauses: lockedClausesFor(task, parameters),
    negativeBase: BASE_NEGATIVE,
    promptNotes: promptNotesFor(task),
  };
}

function guidanceForParameter(
  name: string,
  value: string | number | boolean | null,
  task: WorkflowTask,
): WorkflowParameterGuidance | null {
  if (name === "steps") {
    return {
      name,
      currentValue: value,
      recommendedRange: task === "i2v" || task === "first-last-frame" ? "4-12 for current Wan tests" : "20-30 for SDXL stills",
      effect: "Controls how many denoising passes the sampler runs.",
      increaseEffect: "Can add detail and coherence, but costs time and may overcook texture.",
      decreaseEffect: "Runs faster and can keep motion/video tests lighter, but may reduce detail.",
      warning: "Do not compare prompt changes while also changing steps unless you are testing runtime or detail.",
      example: "The current SDXL OpenPose lane is around 24 steps; the Wan proof lanes use much lower steps.",
    };
  }
  if (name === "cfg") {
    return {
      name,
      currentValue: value,
      recommendedRange: task === "i2v" || task === "first-last-frame" ? "1-3" : "4-6",
      effect: "Controls prompt adherence versus model freedom.",
      increaseEffect: "Follows text more strongly, useful for missed setting/style cues.",
      decreaseEffect: "Can look more natural and less brittle, useful for video or source-preserving work.",
      warning: "Too high can create harsh texture, anatomy stress, or over-literal results.",
      example: "Juggernaut still workflows have worked around 4.7-5.2; Wan video proofs are closer to 1-3.",
    };
  }
  if (name === "denoise") {
    const range =
      task === "img2img"
        ? "0.18-0.35 for preservation"
        : task === "inpaint"
          ? "0.25-0.8 depending on mask size"
          : "1.0 for fresh generation";
    return {
      name,
      currentValue: value,
      recommendedRange: range,
      effect: "Controls how much the generation can depart from the source or latent.",
      increaseEffect: "Allows larger visual changes, stronger repair, or more reimagining.",
      decreaseEffect: "Preserves identity, composition, lighting, and surrounding pixels.",
      warning: "High denoise on source-guided work is the fastest path to identity drift.",
      example: "Identity polish has worked low around 0.18-0.35; bigger inpaint repairs may need more.",
    };
  }
  if (name === "control_strength") {
    return {
      name,
      currentValue: value,
      recommendedRange: "0.62-0.85 for SDXL OpenPose",
      effect: "Controls how strongly the OpenPose reference anchors the body geometry.",
      increaseEffect: "Better pose accuracy and full-body discipline.",
      decreaseEffect: "More creative freedom and less rigid body placement.",
      warning: "Too high can make anatomy stiff; too low can lose hands, feet, or pose.",
      example: "The production OpenPose lane has worked around 0.82; flexible pose tests can run lower.",
    };
  }
  if (name === "control_start" || name === "control_end") {
    return {
      name,
      currentValue: value,
      recommendedRange: name === "control_start" ? "0.0" : "0.8-1.0",
      effect: "Controls when the pose/control signal is active during sampling.",
      increaseEffect: "For end percent, keeps pose influence active longer.",
      decreaseEffect: "For end percent, releases the model earlier for softer detail.",
      warning: "Changing timing can look like a prompt failure when it is really control timing drift.",
      example: "Current OpenPose graphs generally start at 0 and end near 0.95-1.0.",
    };
  }
  if (name === "lora_strength_model" || name === "lora_strength_clip") {
    return {
      name,
      currentValue: value,
      recommendedRange: name === "lora_strength_model" ? "0.18-0.9 depending on branch" : "0.0 for current realism support",
      effect: "Controls how strongly the LoRA changes model behavior or text conditioning.",
      increaseEffect: "Stronger style/identity/realism influence.",
      decreaseEffect: "Less drift from the base checkpoint and source image.",
      warning: "High LoRA strength can overpower subtle prompt changes.",
      example: "Canopus has been useful as realism support; keep changes small when testing prompts.",
    };
  }
  if (name === "width" || name === "height") {
    return {
      name,
      currentValue: value,
      recommendedRange: task === "openpose" ? "640 x 1536 for vertical full-body OpenPose" : "match accepted workflow aspect",
      effect: "Controls aspect ratio and the space available for body framing or video.",
      increaseEffect: "More canvas space on that axis, but more compute.",
      decreaseEffect: "Faster and sometimes more stable, but can crop subjects.",
      warning: "Changing aspect ratio can break OpenPose or video framing comparisons.",
      example: "The strongest OpenPose stills use tall vertical framing; selected Wan outputs use compact video dimensions.",
    };
  }
  if (name === "sampler" || name === "scheduler") {
    return {
      name,
      currentValue: value,
      recommendedRange: "Keep current unless deliberately testing sampler behavior",
      effect: "Changes the sampling path and texture/contrast character.",
      increaseEffect: "Not numeric; swapping can make output sharper, smoother, or less stable.",
      decreaseEffect: "Not numeric; revert to the known-good pair for comparisons.",
      warning: "Sampler changes can hide whether the prompt structure actually improved.",
      example: "SDXL stills have worked with dpmpp_2m_sde + karras; some inpaint lanes use dpmpp_2m.",
    };
  }
  if (name === "length" || name === "frame_rate" || name === "fps") {
    return {
      name,
      currentValue: value,
      recommendedRange: "Use the workflow default before lengthening",
      effect: "Controls video duration or playback cadence.",
      increaseEffect: "Longer or smoother clips, with more room for drift.",
      decreaseEffect: "Shorter tests that are cheaper and easier to inspect.",
      warning: "Length increases should happen after the keyframe and motion prompt are already accepted.",
      example: "The length-expansion proof reused the v19 stack after a shorter proof worked.",
    };
  }
  return null;
}

function parameterGuidanceFor(
  task: WorkflowTask,
  parameters: Record<string, string | number | boolean>,
  controlModels: string[],
  loras: string[],
) {
  const names = new Set(Object.keys(parameters));
  if (controlModels.length) {
    names.add("control_strength");
    names.add("control_start");
    names.add("control_end");
  }
  if (loras.length) {
    names.add("lora_strength_model");
    names.add("lora_strength_clip");
  }
  return [...names]
    .map((name) => guidanceForParameter(name, parameters[name] ?? null, task))
    .filter((item): item is WorkflowParameterGuidance => item !== null);
}

function examplePromptsFor(
  relativePath: string,
  task: WorkflowTask,
  extracted: ReturnType<typeof collectFromWorkflow>,
) {
  if (!extracted.promptPreview.positive) return [];
  return [
    {
      label: task === "openpose" ? "Extracted OpenPose prompt structure" : "Extracted working prompt structure",
      positive: extracted.promptPreview.positive,
      negative: extracted.promptPreview.negative,
      parameters: extracted.parameters,
      sourcePath: relativePath,
      note:
        task === "openpose"
          ? "Use this as a structure reference: keep pose/framing clauses locked, then swap setting, lighting, subject look, or camera."
          : "Use this as a structure reference and change one prompt slot or parameter family at a time.",
    },
  ];
}

function defaultUseWhen(task: WorkflowTask, status: string) {
  if (status.includes("favourite")) return "Use when this favourite branch matches the current creative test.";
  if (status.includes("smoke")) return "Use as evidence from the RunPod smoke pass, not as the default starting graph.";
  if (task === "text2img") return "Use when no source or control image should be required.";
  if (task === "openpose") return "Use when pose and composition control are more important than prompt freedom.";
  if (task === "img2img") return "Use when an existing image should be preserved while changing selected attributes.";
  if (task === "inpaint") return "Use when a local defect can be fixed with a tight mask.";
  if (task === "i2v") return "Use when an accepted still should become a short video.";
  if (task === "interpolation") return "Use after a video clip exists and only smoothing/interpolation is needed.";
  return "Use only when the workflow-specific notes match the job.";
}

function defaultWhyGood(task: WorkflowTask, status: string) {
  if (status === "reference only") return "Kept for comparison, debugging, or archaeology; do not start here by default.";
  if (status.includes("smoke")) return "Produced or accompanied a RunPod smoke output and documents pod-visible behavior.";
  if (status.includes("favourite") || status.includes("current best")) {
    return "Promoted into the favourites package that was synced to the RunPod workflow browser.";
  }
  if (task === "openpose") return "OpenPose gives repeatable full-body pose and framing discipline.";
  if (task === "img2img") return "Source guidance keeps identity, composition, or continuity closer to the selected image.";
  if (task === "inpaint") return "Local repair avoids disturbing the whole accepted frame.";
  if (task === "i2v") return "Image-to-video starts from an accepted keyframe and keeps the visual branch coherent.";
  if (task === "interpolation") return "Interpolation improves motion smoothness without another generative pass.";
  return "Catalogued from the current good workflow set.";
}

function entryFor(filePath: string): WorkflowEntry {
  const relativePath = path.relative(MEDIA_ROOT, filePath).split(path.sep).join("/");
  const fileName = path.basename(filePath);
  const json = readJson(filePath);
  const extracted = collectFromWorkflow(json);
  const task = inferTask(relativePath);
  const status = inferStatus(relativePath);
  const curated = CURATED[fileName] ?? {};
  const cloudPath = relativePath.includes("04_Workflows/Favourites")
    ? `/workspace/ComfyUI/user/default/workflows/Media_Creation/Favourites/${path.relative(
        path.join(MEDIA_ROOT, "04_Workflows/Favourites"),
        filePath,
      ).split(path.sep).join("/")}`
    : relativePath.includes("04_Workflows/Proven_Workflows")
      ? `/workspace/ComfyUI/user/default/workflows/Media_Creation/Proven/${path.relative(
          path.join(MEDIA_ROOT, "04_Workflows/Proven_Workflows"),
          filePath,
        ).split(path.sep).join("/")}`
      : relativePath.includes("04_Workflows/Still_Image/Good")
      ? `/workspace/ComfyUI/user/default/workflows/Media_Creation/Good_Still/${fileName}`
      : relativePath.includes("04_Workflows/Video/Good")
        ? `/workspace/ComfyUI/user/default/workflows/Media_Creation/Good_Video/${fileName}`
        : null;

  return {
    id: slug(relativePath),
    title: titleFromFile(fileName),
    path: relativePath,
    cloudPath,
    media: inferMedia(relativePath),
    status,
    task,
    sourceSet: sourceSet(relativePath),
    useWhen: curated.useWhen ?? defaultUseWhen(task, status),
    whyGood: curated.whyGood ?? defaultWhyGood(task, status),
    whatWorked:
      curated.whatWorked ??
      [
        task === "openpose"
          ? "Pose reference and ControlNet fields are visible in the workflow."
          : task === "img2img"
            ? "The workflow includes source-image preservation controls."
            : task === "i2v"
              ? "The workflow starts from an accepted image branch before motion."
              : "The workflow is present in the current synced reference set.",
      ],
    inputs: curated.inputs ?? defaultInputs(task, extracted.imageInputs),
    models: extracted.models,
    controlModels: extracted.controlModels,
    loras: extracted.loras,
    imageInputs: extracted.imageInputs,
    parameters: extracted.parameters,
    promptPreview: extracted.promptPreview,
    promptRecipe: promptRecipeFor(task, extracted.parameters),
    parameterGuidance: parameterGuidanceFor(
      task,
      extracted.parameters,
      extracted.controlModels,
      extracted.loras,
    ),
    examplePrompts: examplePromptsFor(relativePath, task, extracted),
    notes: curated.notes ?? [],
  };
}

function readIfExists(relativePath: string) {
  const fullPath = path.join(MEDIA_ROOT, relativePath);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function parseModelManifest() {
  const text = readIfExists("13_RunPod_Pilot/manifests/model_manifest.tsv");
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [status, role, localPath, remotePath, sourceUrl, notes] = line.split("\t");
      return {
        status,
        role,
        file: path.basename(localPath ?? ""),
        remotePath,
        sourceUrl,
        notes,
      };
    });
}

function buildCatalog() {
  const workflows = WORKFLOW_DIRS.flatMap((relativeDir) =>
    walk(path.join(MEDIA_ROOT, relativeDir)),
  )
    .map(entryFor)
    .sort((a, b) => {
      const sourceOrder = { proven: 0, good: 1, favourites: 2, "runpod-smoke": 3, reference: 4 };
      return (
        sourceOrder[a.sourceSet] - sourceOrder[b.sourceSet] ||
        a.media.localeCompare(b.media) ||
        a.task.localeCompare(b.task) ||
        a.title.localeCompare(b.title)
      );
    });

  const syncStatus = readIfExists("05_Favourites/cloud/SYNC_STATUS.md");
  const cloudAccess = readIfExists("13_RunPod_Pilot/CLOUD_BROWSER_WORKFLOW_ACCESS.md");
  const workflowManifest = readIfExists("13_RunPod_Pilot/manifests/workflow_manifest.txt");

  const podEndpoint =
    syncStatus.match(/root@([^\s`]+):(\d+)/)?.[0] ??
    cloudAccess.match(/root@[^\n`]+ -p \d+/)?.[0] ??
    null;
  const tunnel =
    cloudAccess.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ??
    syncStatus.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ??
    null;

  const catalog = {
    generatedAt: new Date().toISOString(),
    sourceRoot: MEDIA_ROOT,
    title: "Media Workflow Reference",
    updateRule:
      "When Media Creation workflows, pod model inventory, favourite workflow sync, or selected outputs change, run npm run media:workflows and update the dashboard Workflow Reference page before shipping.",
    summary: {
      workflowCount: workflows.length,
      goodWorkflowCount: workflows.filter((workflow) => workflow.sourceSet === "good").length,
      provenWorkflowCount: workflows.filter((workflow) => workflow.sourceSet === "proven").length,
      favouriteWorkflowCount: workflows.filter((workflow) => workflow.sourceSet === "favourites").length,
      podSmokeWorkflowCount: workflows.filter((workflow) => workflow.sourceSet === "runpod-smoke").length,
      podEndpoint,
      tunnel,
      favouriteSync:
        syncStatus.match(/Verified after sync:[\s\S]*?ComfyUI model registry[^\n]+/)?.[0] ??
        "See 05_Favourites/cloud/SYNC_STATUS.md.",
      workflowManifest: workflowManifest
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .slice(0, 16),
    },
    models: parseModelManifest(),
    workflows,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, OUTPUT_PATH)} with ${workflows.length} workflows.`);
}

buildCatalog();
