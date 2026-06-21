import { z } from "zod";

const PromptBuilderScalarSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
]);

export const PromptBuilderTaskSchema = z.enum([
  "text2img",
  "openpose",
  "img2img",
  "inpaint",
  "upscale-export",
  "i2v",
  "first-last-frame",
  "interpolation",
  "reference",
]);

export const PromptBuilderPromptSlotSchema = z
  .object({
    id: z.enum([
      "subject",
      "setting",
      "action",
      "composition",
      "lighting",
      "camera",
      "style",
      "constraints",
    ]),
    label: z.string().min(1).max(80),
    defaultValue: z.string().max(700),
    help: z.string().max(500),
    examples: z.array(z.string().max(300)).max(8),
  })
  .strict();

export const PromptBuilderPromptRecipeSchema = z
  .object({
    scaffold: z.array(z.string().min(1).max(80)).max(12),
    slots: z.array(PromptBuilderPromptSlotSchema).max(12),
    lockedClauses: z.array(z.string().min(1).max(300)).max(10),
    negativeBase: z.array(z.string().min(1).max(90)).max(40),
    promptNotes: z.array(z.string().min(1).max(320)).max(8),
  })
  .strict();

export const PromptBuilderParameterGuidanceSchema = z
  .object({
    name: z.string().min(1).max(80),
    currentValue: PromptBuilderScalarSchema.nullable(),
    recommendedRange: z.string().min(1).max(180),
    effect: z.string().min(1).max(320),
    increaseEffect: z.string().min(1).max(260),
    decreaseEffect: z.string().min(1).max(260),
    warning: z.string().min(1).max(260),
    example: z.string().min(1).max(320),
  })
  .strict();

export const PromptBuilderExamplePromptSchema = z
  .object({
    label: z.string().min(1).max(120),
    positive: z.string().min(1).max(900),
    negative: z.string().max(900).nullable(),
    parameters: z.record(z.string(), PromptBuilderScalarSchema).default({}),
    sourcePath: z.string().min(1).max(500),
    note: z.string().min(1).max(360),
  })
  .strict();

export const PromptBuilderRequestSchema = z
  .object({
    workflowId: z.string().min(1).max(240),
    workflow: z
      .object({
        title: z.string().min(1).max(240),
        media: z.enum(["still", "video"]),
        task: PromptBuilderTaskSchema,
        status: z.string().max(120),
        useWhen: z.string().max(600),
        whyGood: z.string().max(900),
        inputs: z.array(z.string().max(120)).max(12),
        models: z.array(z.string().max(180)).max(12),
        controlModels: z.array(z.string().max(180)).max(12),
        loras: z.array(z.string().max(180)).max(12),
        parameters: z.record(z.string(), PromptBuilderScalarSchema).default({}),
        promptPreview: z
          .object({
            positive: z.string().nullable(),
            negative: z.string().nullable(),
          })
          .strict(),
        promptRecipe: PromptBuilderPromptRecipeSchema,
        parameterGuidance: z.array(PromptBuilderParameterGuidanceSchema).max(30),
        examplePrompts: z.array(PromptBuilderExamplePromptSchema).max(10),
      })
      .strict(),
    brief: z
      .object({
        subjectPreset: z.string().max(120).default(""),
        settingPreset: z.string().max(120).default(""),
        lightingPreset: z.string().max(120).default(""),
        cameraPreset: z.string().max(120).default(""),
        subject: z.string().max(700).default(""),
        scene: z.string().max(700).default(""),
        action: z.string().max(500).default(""),
        mood: z.string().max(300).default(""),
        lighting: z.string().max(300).default(""),
        camera: z.string().max(300).default(""),
        composition: z.string().max(400).default(""),
        style: z.string().max(400).default(""),
        constraints: z.string().max(900).default(""),
        negativeAdditions: z.string().max(900).default(""),
        selectedTokens: z.array(z.string().min(1).max(90)).max(40).default([]),
      })
      .strict(),
    parameterOverrides: z
      .record(z.string().max(80), z.string().max(240))
      .default({}),
    successContext: z
      .object({
        averageRating: z.number().min(0).max(5).nullable().default(null),
        keeperCount: z.number().int().min(0).max(10000).default(0),
        recentRunCount: z.number().int().min(0).max(10000).default(0),
        topNotes: z.array(z.string().max(300)).max(8).default([]),
      })
      .strict()
      .default({
        averageRating: null,
        keeperCount: 0,
        recentRunCount: 0,
        topNotes: [],
      }),
  })
  .strict();

export const PromptBuilderSectionSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    text: z.string().min(1).max(900),
    locked: z.boolean(),
    source: z.enum(["user", "workflow", "safety", "success-context"]),
  })
  .strict();

export const PromptBuilderSuggestedParameterSchema = z
  .object({
    name: z.string().min(1).max(80),
    currentValue: z.string().max(160),
    suggestedValue: z.string().max(160),
    recommendedRange: z.string().min(1).max(180),
    reason: z.string().min(1).max(320),
    risk: z.string().min(1).max(260),
  })
  .strict();

export const PromptBuilderFitCheckSchema = z
  .object({
    label: z.string().min(1).max(120),
    status: z.enum(["pass", "review", "missing"]),
    detail: z.string().min(1).max(260),
  })
  .strict();

export const PromptBuilderVariantSchema = z
  .object({
    label: z.string().min(1).max(80),
    positivePrompt: z.string().min(1).max(2200),
    reason: z.string().min(1).max(240),
  })
  .strict();

export const PromptBuilderOutputSchema = z
  .object({
    positivePrompt: z.string().min(1).max(2600),
    negativePrompt: z.string().min(1).max(2000),
    promptSections: z.array(PromptBuilderSectionSchema).min(1).max(12),
    suggestedParameters: z
      .array(PromptBuilderSuggestedParameterSchema)
      .max(12),
    workflowNotes: z.array(z.string().min(1).max(240)).min(1).max(8),
    variants: z.array(PromptBuilderVariantSchema).min(1).max(4),
    fitChecks: z.array(PromptBuilderFitCheckSchema).min(1).max(8),
    warnings: z.array(z.string().min(1).max(220)).max(6),
  })
  .strict();

export type PromptBuilderRequest = z.infer<typeof PromptBuilderRequestSchema>;
export type PromptBuilderOutput = z.infer<typeof PromptBuilderOutputSchema>;
