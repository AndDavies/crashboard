export type MediaWorkflowTask =
  | "text2img"
  | "openpose"
  | "img2img"
  | "inpaint"
  | "upscale-export"
  | "i2v"
  | "first-last-frame"
  | "interpolation"
  | "reference";

export type MediaWorkflowEntry = {
  id: string;
  title: string;
  path: string;
  cloudPath: string | null;
  media: "still" | "video";
  status: string;
  task: MediaWorkflowTask;
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
  promptRecipe: MediaWorkflowPromptRecipe;
  parameterGuidance: MediaWorkflowParameterGuidance[];
  examplePrompts: MediaWorkflowExamplePrompt[];
  notes: string[];
};

export type MediaWorkflowPromptSlot = {
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

export type MediaWorkflowPromptRecipe = {
  scaffold: string[];
  slots: MediaWorkflowPromptSlot[];
  lockedClauses: string[];
  negativeBase: string[];
  promptNotes: string[];
};

export type MediaWorkflowParameterGuidance = {
  name: string;
  currentValue: string | number | boolean | null;
  recommendedRange: string;
  effect: string;
  increaseEffect: string;
  decreaseEffect: string;
  warning: string;
  example: string;
};

export type MediaWorkflowExamplePrompt = {
  label: string;
  positive: string;
  negative: string | null;
  parameters: Record<string, string | number | boolean>;
  sourcePath: string;
  note: string;
};

export type MediaWorkflowModel = {
  status: string;
  role: string;
  file: string;
  remotePath: string;
  sourceUrl: string;
  notes: string;
};

export type MediaWorkflowCatalog = {
  generatedAt: string;
  sourceRoot: string;
  title: string;
  updateRule: string;
  summary: {
    workflowCount: number;
    goodWorkflowCount: number;
    provenWorkflowCount?: number;
    favouriteWorkflowCount: number;
    podSmokeWorkflowCount: number;
    podEndpoint: string | null;
    tunnel: string | null;
    favouriteSync: string;
    workflowManifest: string[];
  };
  models: MediaWorkflowModel[];
  workflows: MediaWorkflowEntry[];
};
