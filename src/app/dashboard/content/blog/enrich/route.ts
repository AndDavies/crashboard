import OpenAI from "openai";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicWikiPages } from "@/lib/public-wiki/data";
import { requireDashboardUser } from "@/lib/blog/data";
import {
  BLOG_ENRICHMENT_MODEL,
  BlogEnrichmentRequestSchema,
  generateBlogEnrichment,
} from "@/lib/blog/enrichment";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireDashboardUser();
  } catch {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BlogEnrichmentRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid enrichment request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const wikiPages = getPublicWikiPages().map((page) => ({
    slug: page.slug,
    title: page.title,
    description: page.description,
  }));

  try {
    const enrichment = await generateBlogEnrichment(
      { ...parsed.data, wikiPages },
      {
        client: new OpenAI({ apiKey }),
        model: BLOG_ENRICHMENT_MODEL,
      },
    );

    return NextResponse.json({ enrichment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI enrichment failed.";
    const status = message.includes("body content") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
