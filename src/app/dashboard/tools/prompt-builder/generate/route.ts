import OpenAI from "openai";
import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import {
  buildLocalPromptBuilderOutput,
  generatePromptBuilderOutput,
  PROMPT_BUILDER_MODEL,
} from "@/lib/prompt-builder/generate";
import { PromptBuilderRequestSchema } from "@/lib/prompt-builder/schema";

export const runtime = "nodejs";

function shortWarning(message: string) {
  return message.length <= 220 ? message : `${message.slice(0, 216).trim()}...`;
}

export async function POST(request: NextRequest) {
  try {
    await requireDashboardUser();
  } catch {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PromptBuilderRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid prompt request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      result: buildLocalPromptBuilderOutput(parsed.data, [
        "OPENAI_API_KEY is not configured, so this is the local workflow-aware fallback.",
      ]),
      fallback: true,
    });
  }

  try {
    const result = await generatePromptBuilderOutput(parsed.data, {
      client: new OpenAI({ apiKey }),
      model: PROMPT_BUILDER_MODEL,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[prompt-builder] Generation failed.", error);
    return NextResponse.json({
      result: buildLocalPromptBuilderOutput(parsed.data, [
        error instanceof Error
          ? shortWarning(`OpenAI optimization failed: ${error.message}`)
          : "OpenAI optimization failed; this is the local fallback.",
      ]),
      fallback: true,
    });
  }
}
