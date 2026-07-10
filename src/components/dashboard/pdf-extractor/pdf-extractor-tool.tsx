"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  FileTextIcon,
  ImageIcon,
  LinkIcon,
  Loader2Icon,
  SaveIcon,
  UploadIcon,
} from "lucide-react";
import type {
  PdfExtractionResult,
  PdfOutputMode,
} from "@/lib/pdf-extractor/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SourceMode = "upload" | "url" | "path";
type PreviewTab = "markdown" | "text";

type SavedState = {
  markdownPath: string;
  assetDir: string;
  assetCount: number;
};

const BROWSER_UPLOAD_LIMIT_BYTES = 75 * 1024 * 1024;

function formatBytes(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function statusVariant(status: PdfExtractionResult["status"]) {
  if (status === "failed") return "destructive";
  if (status === "partial") return "outline";
  return "secondary";
}

function sourceModeIcon(mode: SourceMode) {
  if (mode === "url") return <LinkIcon className="size-4" aria-hidden />;
  if (mode === "path") return <FileTextIcon className="size-4" aria-hidden />;
  return <UploadIcon className="size-4" aria-hidden />;
}

export function PdfExtractorTool() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [password, setPassword] = useState("");
  const [pageRange, setPageRange] = useState("");
  const [outputMode, setOutputMode] = useState<PdfOutputMode>("markdown");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PdfExtractionResult | null>(null);
  const [saved, setSaved] = useState<SavedState | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("markdown");

  const previewText = useMemo(() => {
    if (!result) return "";
    return previewTab === "markdown" ? result.markdown : result.plainText;
  }, [previewTab, result]);

  const oversizedUpload =
    sourceMode === "upload" &&
    selectedFile !== null &&
    selectedFile.size > BROWSER_UPLOAD_LIMIT_BYTES;
  const selectedFileSizeLabel = selectedFile ? formatBytes(selectedFile.size) : "";

  async function copyPreview() {
    if (!previewText || !navigator.clipboard) return;
    await navigator.clipboard.writeText(previewText);
  }

  async function extract() {
    setIsExtracting(true);
    setError(null);
    setSaved(null);
    try {
      const formData = new FormData();
      formData.set("sourceType", sourceMode);
      formData.set("password", password);
      formData.set("pageRange", pageRange);
      formData.set("outputMode", outputMode);
      formData.set("aiMode", aiEnabled ? "selective" : "off");

      if (sourceMode === "upload") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose a PDF file.");
        if (file.size > BROWSER_UPLOAD_LIMIT_BYTES) {
          throw new Error(
            `This PDF is ${formatBytes(file.size)}. Browser uploads are capped at ${formatBytes(BROWSER_UPLOAD_LIMIT_BYTES)}; use Local Path or the CLI for larger PDFs.`,
          );
        }
        formData.set("file", file);
      } else if (sourceMode === "url") {
        formData.set("url", url);
      } else {
        formData.set("path", localPath);
      }

      const response = await fetch("/dashboard/tools/pdf-extractor/extract", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        result?: PdfExtractionResult;
        error?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "PDF extraction failed.");
      }
      setResult(payload.result);
      setPreviewTab(outputMode === "text" ? "text" : "markdown");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function save() {
    if (!result) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/dashboard/tools/pdf-extractor/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result }),
      });
      const payload = (await response.json()) as {
        saved?: SavedState;
        error?: string;
      };
      if (!response.ok || !payload.saved) {
        throw new Error(payload.error || "Could not save extraction.");
      }
      setSaved(payload.saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save extraction.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">Tools</p>
          <h2 className="mt-2 font-heading text-4xl font-semibold tracking-tight text-foreground">
            PDF extractor
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Convert local PDFs into Markdown or text companions for the vault,
            including rendered pages and extracted visual assets.
          </p>
        </div>
        {result ? (
          <Badge variant={statusVariant(result.status)} className="capitalize">
            {result.status}
          </Badge>
        ) : null}
      </section>

      <section className="grid gap-4 border-y border-foreground/80 bg-card/40 py-5">
        <div className="grid gap-3 md:grid-cols-3">
          {(["upload", "url", "path"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              variant={sourceMode === mode ? "default" : "outline"}
              className="justify-start"
              onClick={() => setSourceMode(mode)}
            >
              {sourceModeIcon(mode)}
              {mode === "upload" ? "Upload" : mode === "url" ? "URL" : "Local Path"}
            </Button>
          ))}
        </div>

        {sourceMode === "upload" ? (
          <div className="space-y-2">
            <Input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) =>
                setSelectedFile(event.currentTarget.files?.[0] ?? null)
              }
            />
            {oversizedUpload ? (
              <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  This PDF is {selectedFileSizeLabel}. Browser uploads are
                  capped at {formatBytes(BROWSER_UPLOAD_LIMIT_BYTES)}; use Local
                  Path mode or <code>npm run pdf:extract</code> for larger PDFs.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {sourceMode === "url" ? (
          <Input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/file.pdf"
          />
        ) : null}

        {sourceMode === "path" ? (
          <Input
            value={localPath}
            onChange={(event) => setLocalPath(event.target.value)}
            placeholder="/Users/andrewdavies/.../raw/example.pdf"
          />
        ) : null}

        <div className="grid gap-3 md:grid-cols-[1fr_14rem_14rem]">
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Password, if needed"
          />
          <Input
            value={pageRange}
            onChange={(event) => setPageRange(event.target.value)}
            placeholder="Pages, e.g. 1-5,8"
          />
          <select
            value={outputMode}
            onChange={(event) => setOutputMode(event.target.value as PdfOutputMode)}
            className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="markdown">Markdown</option>
            <option value="text">Text</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(event) => setAiEnabled(event.target.checked)}
            className="size-4 rounded border-border"
          />
          Selective AI descriptions for image-heavy or low-text pages
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void extract()}
            disabled={isExtracting || oversizedUpload}
          >
            {isExtracting ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileTextIcon className="size-4" aria-hidden />
            )}
            Extract
          </Button>
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => void save()}
            disabled={!result?.saveEligibility || isSaving}
          >
            {isSaving ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <SaveIcon className="size-4" aria-hidden />
            )}
            Save Companion
          </Button>
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => void copyPreview()}
            disabled={!previewText}
          >
            <CopyIcon className="size-4" aria-hidden />
            Copy
          </Button>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      {saved ? (
        <div className="flex items-start gap-2 border border-accent/30 bg-accent/10 p-4 text-sm text-foreground">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Saved companion output.</p>
            <p className="mt-1 break-all text-muted-foreground">
              {saved.markdownPath}
            </p>
            <p className="mt-1 break-all text-muted-foreground">
              {saved.assetCount} assets in {saved.assetDir}
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="min-w-0 border-y border-foreground/80 bg-card/40 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={previewTab === "markdown" ? "default" : "outline"}
                  onClick={() => setPreviewTab("markdown")}
                >
                  Markdown
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={previewTab === "text" ? "default" : "outline"}
                  onClick={() => setPreviewTab("text")}
                >
                  Text
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.metadata.pageCount} pages, {result.visualAssets.length} assets
              </p>
            </div>
            <textarea
              readOnly
              value={previewText}
              className="mt-4 min-h-[32rem] w-full resize-y border border-border/80 bg-background p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </section>

          <aside className="space-y-4">
            <section className="border-t border-foreground/80 pt-4">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                Diagnostics
              </h3>
              <div className="mt-3 space-y-2">
                {result.diagnostics.length > 0 ? (
                  result.diagnostics.map((item, index) => (
                    <div
                      key={`${item.code}-${index}`}
                      className={cn(
                        "border p-3 text-xs leading-relaxed",
                        item.level === "error"
                          ? "border-destructive/30 bg-destructive/5 text-destructive"
                          : "border-border/80 bg-background text-muted-foreground",
                      )}
                    >
                      <p className="font-medium text-foreground">{item.code}</p>
                      <p className="mt-1">{item.message}</p>
                      {item.detail ? (
                        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words bg-background/70 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {item.detail}
                        </pre>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No diagnostics.</p>
                )}
              </div>
            </section>

            <section className="border-t border-foreground/80 pt-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="font-heading text-sm font-semibold text-foreground">
                  Assets
                </h3>
              </div>
              <div className="mt-3 space-y-2">
                {result.visualAssets.length > 0 ? (
                  result.visualAssets.slice(0, 18).map((asset) => (
                    <div
                      key={`${asset.kind}-${asset.absolutePath}`}
                      className="border border-border/80 bg-background p-3 text-xs"
                    >
                      <p className="font-medium text-foreground">{asset.fileName}</p>
                      <p className="mt-1 text-muted-foreground">
                        {asset.kind}
                        {asset.pageNumber ? `, page ${asset.pageNumber}` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No assets extracted.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
