import {
  INGESTION_EXTRACTION_VERSION,
  INGESTION_ORIGIN_API,
} from "@/lib/ingestion/constants";
import { sha256Hex } from "@/lib/ingestion/hash";
import {
  cleanTitle,
  estimateTokensFromText,
  normalizeTextForStorage,
} from "@/lib/ingestion/normalize";
import { extractPdfPayload } from "@/lib/ingestion/pdf";
import { createIngestionRepository, type SourceRow } from "@/lib/ingestion/repository";
import type {
  ContentKind,
  IngestionApiRequest,
  IngestionRunOptions,
  IngestionServiceError,
  IngestionServiceResult,
  SourceType,
} from "@/lib/ingestion/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractFromHtml,
  extractFromPlainText,
  fetchRemoteResource,
  IngestionFetchError,
  isPdfContentType,
  looksLikePdfUrl,
  normalizeIngestionUrl,
} from "@/lib/ingestion/url";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseIngestionRequest(
  body: unknown,
):
  | { ok: true; value: IngestionApiRequest }
  | { ok: false; message: string } {
  if (!isRecord(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const kind = body.kind;
  if (kind !== "url" && kind !== "pdf") {
    return { ok: false, message: 'Field "kind" must be "url" or "pdf".' };
  }
  const url = body.url;
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, message: 'Field "url" is required and must be a non-empty string.' };
  }
  let metadata: Record<string, unknown> | undefined;
  if (body.metadata !== undefined) {
    if (!isRecord(body.metadata)) {
      return { ok: false, message: 'Field "metadata" must be an object when provided.' };
    }
    metadata = body.metadata;
  }
  const title =
    typeof body.title === "string" ? body.title : undefined;
  const triggerType =
    typeof body.triggerType === "string" ? body.triggerType : undefined;
  const triggerReference =
    typeof body.triggerReference === "string"
      ? body.triggerReference
      : undefined;

  return {
    ok: true,
    value: {
      kind,
      url,
      title,
      metadata,
      triggerType,
      triggerReference,
    },
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string };
  return (
    o.code === "23505" ||
    (o.message?.includes("duplicate key") ?? false) ||
    (o.message?.includes("sources_canonical_url_unique_idx") ?? false) ||
    (o.message?.includes("sources_content_hash_unique_idx") ?? false)
  );
}

async function reconcileSource(
  repo: ReturnType<typeof createIngestionRepository>,
  params: {
    origin: string;
    sourceType: SourceType;
    originalUrl: string;
    canonicalUrl: string | null;
    title: string | null;
    publisherName: string | null;
    language: string | null;
    contentHash: string | null;
    /** From `IngestionRunOptions.sourceMetadata` (e.g. compact Telegram ids). */
    sourceMetadataLayer: Record<string, unknown> | undefined;
    requestMetadata: Record<string, unknown> | undefined;
  },
): Promise<{ row: SourceRow; existed: boolean }> {
  const metaBase = {
    phase1b: true as const,
    ...params.sourceMetadataLayer,
    ...params.requestMetadata,
  };

  let existing: SourceRow | null = null;
  if (params.canonicalUrl) {
    existing = await repo.findSourceByCanonicalUrl(params.canonicalUrl);
  }
  if (!existing && params.contentHash) {
    existing = await repo.findSourceByContentHash(params.contentHash);
  }

  if (existing) {
    const canonicalPatch =
      !existing.canonical_url && params.canonicalUrl
        ? params.canonicalUrl
        : undefined;

    const row = await repo.updateSource(existing.id, {
      source_type: params.sourceType,
      original_url: params.originalUrl,
      canonical_url: canonicalPatch,
      title: params.title ?? existing.title,
      publisher_name: params.publisherName ?? existing.publisher_name,
      language: params.language ?? existing.language,
      status: "ready",
      content_hash: params.contentHash ?? existing.content_hash,
      last_processed_at: new Date().toISOString(),
      metadata: {
        ...(typeof existing.metadata === "object" &&
        existing.metadata !== null &&
        !Array.isArray(existing.metadata)
          ? (existing.metadata as Record<string, unknown>)
          : {}),
        ...metaBase,
      },
    });
    return { row, existed: true };
  }

  try {
    const row = await repo.insertSource({
      source_type: params.sourceType,
      origin: params.origin,
      original_url: params.originalUrl,
      canonical_url: params.canonicalUrl,
      title: params.title,
      publisher_name: params.publisherName,
      language: params.language,
      status: "ready",
      content_hash: params.contentHash,
      metadata: metaBase,
    });
    return { row, existed: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    let row: SourceRow | null = null;
    if (params.canonicalUrl) {
      row = await repo.findSourceByCanonicalUrl(params.canonicalUrl);
    }
    if (!row && params.contentHash) {
      row = await repo.findSourceByContentHash(params.contentHash);
    }
    if (!row) throw e;
    const updated = await repo.updateSource(row.id, {
      source_type: params.sourceType,
      original_url: params.originalUrl,
      title: params.title ?? row.title,
      publisher_name: params.publisherName ?? row.publisher_name,
      language: params.language ?? row.language,
      status: "ready",
      content_hash: params.contentHash ?? row.content_hash,
      last_processed_at: new Date().toISOString(),
      metadata: {
        ...(typeof row.metadata === "object" &&
        row.metadata !== null &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}),
        ...metaBase,
      },
    });
    return { row: updated, existed: true };
  }
}

async function writePrimaryContent(
  repo: ReturnType<typeof createIngestionRepository>,
  sourceId: string,
  payload: {
    rawText: string | null;
    normalizedText: string | null;
    html: string | null;
    extractionMethod: string;
    qualityFlags: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
): Promise<{ characterCount: number | null; tokenEstimate: number | null }> {
  const norm = payload.normalizedText ?? "";
  const charCount = norm.length > 0 ? norm.length : null;
  const tokens =
    charCount !== null ? estimateTokensFromText(norm) : null;

  await repo.supersedeCurrentContent(sourceId, "primary");
  await repo.insertSourceContent({
    source_id: sourceId,
    content_kind: "primary",
    raw_text: payload.rawText,
    normalized_text: norm.length > 0 ? norm : null,
    markdown: null,
    html: payload.html,
    transcript_text: null,
    extraction_method: payload.extractionMethod,
    extraction_version: INGESTION_EXTRACTION_VERSION,
    token_estimate: tokens,
    character_count: charCount,
    quality_flags: payload.qualityFlags,
    metadata: payload.metadata,
  });
  return { characterCount: charCount, tokenEstimate: tokens };
}

/**
 * Synchronous-style ingestion pipeline: creates a job row, fetches remote content,
 * reconciles `sources` / `source_contents` / optional `source_artifacts`, then completes the job.
 */
export async function runIngestion(
  input: IngestionApiRequest,
  options?: IngestionRunOptions,
): Promise<IngestionServiceResult | IngestionServiceError> {
  let jobId: string | null = null;

  try {
    const admin = options?.admin ?? createAdminClient();
    const repo = createIngestionRepository(admin);
    const origin = options?.origin ?? INGESTION_ORIGIN_API;
    const sourceMetadataLayer = options?.sourceMetadata;

    const rawUrl = input.url!.trim();
    const job = await repo.createJob({
      source_id: null,
      trigger_type:
        input.triggerType?.trim() ||
        `ingestion.${input.kind}`,
      trigger_reference: input.triggerReference?.trim() ?? rawUrl,
    });
    jobId = job.id;

    await repo.markJobProcessing(jobId);

    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeIngestionUrl(rawUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid URL.";
      await repo.markJobFailed(jobId, msg);
      if (e instanceof IngestionFetchError) {
        return {
          ok: false,
          code: "validation",
          message: msg,
          httpStatus: e.httpStatus ?? 400,
          details: { jobId },
        };
      }
      return {
        ok: false,
        code: "validation",
        message: msg,
        httpStatus: 400,
        details: { jobId },
      };
    }

    const fetched = await fetchRemoteResource(normalizedUrl);

    const treatAsPdf =
      input.kind === "pdf" ||
      isPdfContentType(fetched.contentType) ||
      (input.kind === "url" && looksLikePdfUrl(normalizedUrl));

    if (treatAsPdf) {
      if (!fetched.buffer) {
        await repo.markJobFailed(jobId, "PDF response had no binary body.");
        return {
          ok: false,
          code: "fetch",
          message: "PDF response had no binary body.",
          httpStatus: 502,
          details: { jobId },
        };
      }

      const pdf = await extractPdfPayload(fetched.buffer, fetched.contentType);
      const title =
        cleanTitle(input.title) ??
        (() => {
          try {
            const name = new URL(normalizedUrl).pathname.split("/").pop();
            return cleanTitle(name?.replace(/\.pdf$/i, "") ?? null);
          } catch {
            return null;
          }
        })();

      const contentHash =
        pdf.normalizedText && pdf.normalizedText.length > 0
          ? sha256Hex(pdf.normalizedText)
          : null;

      const { row: sourceRow, existed } = await reconcileSource(repo, {
        origin,
        sourceType: "pdf",
        originalUrl: fetched.originalUrl,
        canonicalUrl: normalizeIngestionUrl(fetched.finalUrl),
        title,
        publisherName: null,
        language: null,
        contentHash,
        sourceMetadataLayer,
        requestMetadata: input.metadata,
      });

      await repo.setJobSourceId(jobId, sourceRow.id);

      const storagePath = `ingestion/jobs/${jobId}/document.pdf`;
      const artifact = await repo.insertArtifact({
        source_id: sourceRow.id,
        artifact_type: "downloaded_pdf",
        storage_path: storagePath,
        mime_type: pdf.mimeType,
        byte_size: pdf.byteSize,
        checksum: pdf.checksumHex,
        metadata: {
          phase1b: true,
          sourceUrl: fetched.finalUrl,
        },
      });

      let outSource = sourceRow;
      if (pdf.normalizedText && pdf.normalizedText.length > 0) {
        await writePrimaryContent(repo, sourceRow.id, {
          rawText: pdf.normalizedText,
          normalizedText: pdf.normalizedText,
          html: null,
          extractionMethod: "pdf-parse",
          qualityFlags: {},
          metadata: {
            phase1b: true,
            checksum: pdf.checksumHex,
          },
        });
      } else {
        outSource = await repo.mergeSourceMetadata(
          sourceRow.id,
          sourceRow.metadata,
          {
            phase1bPdf: {
              textExtractionDeferred: true,
              reason: pdf.deferReason ?? "unknown",
            },
          },
        );
      }

      await repo.markJobCompleted(jobId);

      return {
        ok: true,
        job: {
          id: jobId,
          status: "completed",
          errorMessage: null,
        },
        source: {
          id: outSource.id,
          sourceType: outSource.source_type,
          canonicalUrl: outSource.canonical_url,
          contentHash: outSource.content_hash,
          existed,
        },
        content: pdf.normalizedText
          ? {
              contentKind: "primary" as ContentKind,
              characterCount: pdf.normalizedText.length,
              tokenEstimate: estimateTokensFromText(pdf.normalizedText),
              extractionDeferred: false,
            }
          : {
              contentKind: "primary" as ContentKind,
              characterCount: null,
              tokenEstimate: null,
              extractionDeferred: true,
            },
        artifact: {
          id: artifact.id,
          storagePath,
          checksum: pdf.checksumHex,
        },
        summary: pdf.normalizedText
          ? "PDF ingested with extracted text."
          : "PDF ingested; text extraction deferred or empty.",
      };
    }

    if (
      fetched.contentType.includes("text/html") ||
      fetched.contentType.includes("application/xhtml")
    ) {
      if (!fetched.textBody) {
        await repo.markJobFailed(
          jobId,
          "HTML document had no decodable body.",
        );
        return {
          ok: false,
          code: "fetch",
          message: "HTML document had no decodable body.",
          httpStatus: 502,
          details: { jobId },
        };
      }

      const extracted = extractFromHtml(fetched.textBody, fetched.finalUrl);
      const title = cleanTitle(input.title) ?? extracted.title;
      const normalizedText = extracted.normalizedText;
      const contentHash =
        normalizedText.length > 0 ? sha256Hex(normalizedText) : null;

      const canonicalForRow =
        extracted.canonicalUrl ?? normalizeIngestionUrl(fetched.finalUrl);

      const { row: sourceRow, existed } = await reconcileSource(repo, {
        origin,
        sourceType: "article",
        originalUrl: fetched.originalUrl,
        canonicalUrl: canonicalForRow,
        title,
        publisherName: extracted.publisherName,
        language: extracted.language,
        contentHash,
        sourceMetadataLayer,
        requestMetadata: input.metadata,
      });

      await repo.setJobSourceId(jobId, sourceRow.id);

      if (normalizedText.length > 0) {
        await writePrimaryContent(repo, sourceRow.id, {
          rawText: extracted.rawText,
          normalizedText,
          html: null,
          extractionMethod: "cheerio-text",
          qualityFlags: {},
          metadata: {
            phase1b: true,
            finalUrl: fetched.finalUrl,
          },
        });
      }

      await repo.markJobCompleted(jobId);

      return {
        ok: true,
        job: {
          id: jobId,
          status: "completed",
          errorMessage: null,
        },
        source: {
          id: sourceRow.id,
          sourceType: sourceRow.source_type,
          canonicalUrl: sourceRow.canonical_url,
          contentHash: sourceRow.content_hash,
          existed,
        },
        content:
          normalizedText.length > 0
            ? {
                contentKind: "primary",
                characterCount: normalizedText.length,
                tokenEstimate: estimateTokensFromText(normalizedText),
              }
            : undefined,
        summary:
          normalizedText.length > 0
            ? "URL ingested; HTML text extracted."
            : "URL ingested; HTML body had no extractable text.",
      };
    }

    if (fetched.contentType.includes("text/plain")) {
      if (!fetched.textBody) {
        await repo.markJobFailed(jobId, "Plaintext body missing.");
        return {
          ok: false,
          code: "fetch",
          message: "Plaintext body missing.",
          httpStatus: 502,
          details: { jobId },
        };
      }
      const extracted = extractFromPlainText(fetched.textBody);
      const normalizedText = normalizeTextForStorage(extracted.normalizedText);
      const contentHash =
        normalizedText.length > 0 ? sha256Hex(normalizedText) : null;
      const title = cleanTitle(input.title);

      const { row: sourceRow, existed } = await reconcileSource(repo, {
        origin,
        sourceType: "document",
        originalUrl: fetched.originalUrl,
        canonicalUrl: normalizeIngestionUrl(fetched.finalUrl),
        title,
        publisherName: null,
        language: null,
        contentHash,
        sourceMetadataLayer,
        requestMetadata: input.metadata,
      });

      await repo.setJobSourceId(jobId, sourceRow.id);

      if (normalizedText.length > 0) {
        await writePrimaryContent(repo, sourceRow.id, {
          rawText: extracted.rawText,
          normalizedText,
          html: null,
          extractionMethod: "plaintext",
          qualityFlags: {},
          metadata: { phase1b: true, finalUrl: fetched.finalUrl },
        });
      }

      await repo.markJobCompleted(jobId);

      return {
        ok: true,
        job: {
          id: jobId,
          status: "completed",
          errorMessage: null,
        },
        source: {
          id: sourceRow.id,
          sourceType: sourceRow.source_type,
          canonicalUrl: sourceRow.canonical_url,
          contentHash: sourceRow.content_hash,
          existed,
        },
        content:
          normalizedText.length > 0
            ? {
                contentKind: "primary",
                characterCount: normalizedText.length,
                tokenEstimate: estimateTokensFromText(normalizedText),
              }
            : undefined,
        summary: "Plaintext document ingested.",
      };
    }

    await repo.markJobSkipped(
      jobId,
      `Unsupported content-type: ${fetched.contentType}`,
      {
        contentType: fetched.contentType,
      },
    );

    return {
      ok: false,
      code: "validation",
      message: `Unsupported content-type: ${fetched.contentType || "(unknown)"}`,
      httpStatus: 415,
      details: {
        jobId,
        jobStatus: "skipped" as const,
        contentType: fetched.contentType,
      },
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Ingestion failed unexpectedly.";
    if (jobId) {
      try {
        const admin = createAdminClient();
        const repo = createIngestionRepository(admin);
        await repo.markJobFailed(jobId, message, {
          name: e instanceof Error ? e.name : "Error",
        });
      } catch {
        // secondary failure — omit
      }
    }

    if (e instanceof IngestionFetchError) {
      return {
        ok: false,
        code: "fetch",
        message,
        httpStatus: e.httpStatus ?? 502,
        ...(jobId ? { details: { jobId } } : {}),
      };
    }

    if (
      e instanceof Error &&
      e.message.includes("SUPABASE_SERVICE_ROLE_KEY")
    ) {
      return {
        ok: false,
        code: "configuration",
        message: "Server is not configured for ingestion (Supabase service role).",
        httpStatus: 503,
      };
    }

    return {
      ok: false,
      code: "internal",
      message,
      httpStatus: 500,
      ...(jobId ? { details: { jobId } } : {}),
    };
  }
}
