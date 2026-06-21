import { z } from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const PromptRunCreateSchema = z
  .object({
    workflowId: z.string().min(1).max(240),
    workflowTitle: z.string().max(240).default(""),
    workflowTask: z.string().max(80).default(""),
    positivePrompt: z.string().max(4000).default(""),
    negativePrompt: z.string().max(3000).default(""),
    promptSections: z.array(JsonObjectSchema).max(20).default([]),
    parameterOverrides: JsonObjectSchema.default({}),
    selectedPresets: JsonObjectSchema.default({}),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    keeper: z.boolean().default(false),
    notes: z.string().max(1200).default(""),
    failureModes: z.array(z.string().min(1).max(120)).max(20).default([]),
    outputLabel: z.string().max(240).default(""),
    outputPath: z.string().max(700).default(""),
  })
  .strict();

export const PromptPresetCreateSchema = z
  .object({
    workflowId: z.string().min(1).max(240),
    workflowTitle: z.string().max(240).default(""),
    name: z.string().min(1).max(120),
    brief: JsonObjectSchema.default({}),
    parameterOverrides: JsonObjectSchema.default({}),
    notes: z.string().max(1200).default(""),
    sourceRunId: z.string().uuid().nullable().default(null),
  })
  .strict();

export type PromptRunCreateInput = z.infer<typeof PromptRunCreateSchema>;
export type PromptPresetCreateInput = z.infer<typeof PromptPresetCreateSchema>;

export type PromptRunSummary = {
  id: string;
  workflowId: string;
  workflowTitle: string;
  workflowTask: string;
  positivePrompt: string;
  negativePrompt: string;
  promptSections: Record<string, unknown>[];
  parameterOverrides: Record<string, unknown>;
  selectedPresets: Record<string, unknown>;
  rating: number | null;
  keeper: boolean;
  notes: string;
  failureModes: string[];
  outputLabel: string;
  outputPath: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptPresetSummary = {
  id: string;
  workflowId: string;
  workflowTitle: string;
  name: string;
  brief: Record<string, unknown>;
  parameterOverrides: Record<string, unknown>;
  notes: string;
  sourceRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isMissingPromptMetricsRelation(error: {
  code?: string;
  message?: string;
} | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.message?.includes("media_prompt_runs") ||
    error.message?.includes("media_prompt_presets") ||
    false
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function coercePromptRun(row: Record<string, unknown>): PromptRunSummary {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id ?? ""),
    workflowTitle: String(row.workflow_title ?? ""),
    workflowTask: String(row.workflow_task ?? ""),
    positivePrompt: String(row.positive_prompt ?? ""),
    negativePrompt: String(row.negative_prompt ?? ""),
    promptSections: asRecordArray(row.prompt_sections),
    parameterOverrides: asRecord(row.parameter_overrides),
    selectedPresets: asRecord(row.selected_presets),
    rating: typeof row.rating === "number" ? row.rating : null,
    keeper: Boolean(row.keeper),
    notes: String(row.notes ?? ""),
    failureModes: asStringArray(row.failure_modes),
    outputLabel: String(row.output_label ?? ""),
    outputPath: String(row.output_path ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function coercePromptPreset(
  row: Record<string, unknown>,
): PromptPresetSummary {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id ?? ""),
    workflowTitle: String(row.workflow_title ?? ""),
    name: String(row.name ?? ""),
    brief: asRecord(row.brief),
    parameterOverrides: asRecord(row.parameter_overrides),
    notes: String(row.notes ?? ""),
    sourceRunId: typeof row.source_run_id === "string" ? row.source_run_id : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function summarizePromptRuns(runs: PromptRunSummary[]) {
  const rated = runs.filter((run) => run.rating !== null);
  const averageRating = rated.length
    ? rated.reduce((sum, run) => sum + (run.rating ?? 0), 0) / rated.length
    : null;
  const keeperCount = runs.filter((run) => run.keeper).length;
  return {
    averageRating,
    keeperCount,
    recentRunCount: runs.length,
    topNotes: runs
      .filter((run) => run.keeper || (run.rating ?? 0) >= 4)
      .map((run) => run.notes.trim())
      .filter(Boolean)
      .slice(0, 6),
  };
}

export function toPromptRunInsert(input: PromptRunCreateInput, userId: string) {
  return {
    user_id: userId,
    workflow_id: input.workflowId,
    workflow_title: input.workflowTitle,
    workflow_task: input.workflowTask,
    positive_prompt: input.positivePrompt,
    negative_prompt: input.negativePrompt,
    prompt_sections: input.promptSections,
    parameter_overrides: input.parameterOverrides,
    selected_presets: input.selectedPresets,
    rating: input.rating,
    keeper: input.keeper,
    notes: input.notes,
    failure_modes: input.failureModes,
    output_label: input.outputLabel,
    output_path: input.outputPath,
  };
}

export function toPromptPresetInsert(
  input: PromptPresetCreateInput,
  userId: string,
) {
  return {
    user_id: userId,
    workflow_id: input.workflowId,
    workflow_title: input.workflowTitle,
    name: input.name,
    brief: input.brief,
    parameter_overrides: input.parameterOverrides,
    notes: input.notes,
    source_run_id: input.sourceRunId,
  };
}
