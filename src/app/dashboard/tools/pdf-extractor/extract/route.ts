import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { extractPdf } from "@/lib/pdf-extractor";
import { MAX_UPLOAD_BYTES } from "@/lib/pdf-extractor/constants";
import type { PdfAiMode, PdfOutputMode } from "@/lib/pdf-extractor/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function outputMode(value: string): PdfOutputMode {
  return value === "text" ? "text" : "markdown";
}

function aiMode(value: string): PdfAiMode {
  return value === "off" ? "off" : "selective";
}

function uploadLimitLabel() {
  return `${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`;
}

export async function POST(request: NextRequest) {
  try {
    await requireDashboardUser();
  } catch {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[pdf-extractor] Could not parse multipart form body.", error);
    return NextResponse.json(
      {
        error: `Could not read the upload form. Browser uploads are capped at ${uploadLimitLabel()} locally; use Local Path or the CLI for larger PDFs.`,
      },
      { status: 400 },
    );
  }

  const sourceType = stringField(formData, "sourceType") || "upload";
  const password = stringField(formData, "password") || undefined;
  const pageRange = stringField(formData, "pageRange") || undefined;
  const mode = outputMode(stringField(formData, "outputMode"));
  const modelMode = aiMode(stringField(formData, "aiMode"));

  try {
    if (sourceType === "url") {
      const url = stringField(formData, "url");
      if (!url) {
        return NextResponse.json({ error: "Missing PDF URL." }, { status: 400 });
      }
      const result = await extractPdf({
        source: { type: "url", url },
        password,
        pageRange,
        outputMode: mode,
        visualMode: "full-assets",
        aiMode: modelMode,
        openaiApiKey: process.env.OPENAI_API_KEY,
      });
      return NextResponse.json({ result });
    }

    if (sourceType === "path") {
      const localPath = stringField(formData, "path");
      if (!localPath) {
        return NextResponse.json({ error: "Missing local PDF path." }, { status: 400 });
      }
      const result = await extractPdf({
        source: { type: "path", path: localPath },
        password,
        pageRange,
        outputMode: mode,
        visualMode: "full-assets",
        aiMode: modelMode,
        openaiApiKey: process.env.OPENAI_API_KEY,
      });
      return NextResponse.json({ result });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `PDF exceeds the local browser upload limit of ${uploadLimitLabel()}. Use Local Path or the CLI for larger PDFs.`,
        },
        { status: 413 },
      );
    }

    const result = await extractPdf({
      source: {
        type: "upload",
        buffer: Buffer.from(await file.arrayBuffer()),
        sourceName: file.name || "uploaded.pdf",
      },
      password,
      pageRange,
      outputMode: mode,
      visualMode: "full-assets",
      aiMode: modelMode,
      openaiApiKey: process.env.OPENAI_API_KEY,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[pdf-extractor] Extraction failed.", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "PDF extraction failed.",
      },
      { status: 500 },
    );
  }
}
