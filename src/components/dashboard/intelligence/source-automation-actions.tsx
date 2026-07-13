"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Database, Mail, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  parseFullBackfillBatchResponse,
  runFullBackfillBatches,
  type FullBackfillProgress,
} from "@/lib/intelligence/full-backfill";
import {
  INTELLIGENCE_ANALYSIS_PHASES,
  type IntelligenceAnalysisPhase,
} from "@/lib/intelligence/analysis-refresh";
import { cn } from "@/lib/utils";

async function post(endpoint: string, body: Record<string, unknown> = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    result?: Record<string, unknown>;
  };
  if (!response.ok) throw new Error(result.error ?? `Action failed (HTTP ${response.status}).`);
  return result.result ?? {};
}

type AnalysisProgress = {
  phase: IntelligenceAnalysisPhase;
  label: string;
  processed: number;
  batches: number;
};

async function refreshSignals(onProgress?: (progress: AnalysisProgress) => void) {
  let signalCount = 0;
  let processed = 0;
  let batches = 0;
  for (const definition of INTELLIGENCE_ANALYSIS_PHASES) {
    let cursor = 0;
    while (true) {
      onProgress?.({
        phase: definition.phase,
        label: definition.label,
        processed,
        batches,
      });
      const result = await post("/api/intelligence/signals/refresh", {
        cursor,
        limit: definition.limit,
        phase: definition.phase,
      });
      batches += 1;
      processed += Number(result.processed ?? result.scanned ?? 0);
      const signals = result.signals && typeof result.signals === "object"
        ? result.signals as Record<string, unknown>
        : {};
      signalCount = Math.max(signalCount, Number(signals.signalCount ?? result.signalCount ?? 0));
      onProgress?.({
        phase: definition.phase,
        label: definition.label,
        processed,
        batches,
      });
      if (!result.hasMore) break;
      const nextCursor = Number(result.nextCursor);
      if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
        throw new Error(`${definition.label} did not advance its saved checkpoint.`);
      }
      cursor = nextCursor;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }
  return { snapshotCount: signalCount, processed, batches };
}

export function SourceAutomationActions({ gmailConnected }: { gmailConnected: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<FullBackfillProgress | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const stopRef = useRef(false);

  async function run(name: string, endpoint: string, body: Record<string, unknown> = {}) {
    setActive(name);
    setMessage(null);
    setError(false);
    try {
      const result = await post(endpoint, body);
      const processed = Number(result.processed ?? result.snapshotCount ?? 0);
      const failed = Number(result.failed ?? 0);
      setMessage(`${name} completed · ${processed} updated · ${failed} failed.`);
      router.refresh();
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : `${name} failed.`);
    } finally {
      setActive(null);
    }
  }

  async function runRefresh() {
    setActive("Analysis refresh");
    setMessage(null);
    setError(false);
    try {
      const result = await refreshSignals(setAnalysisProgress);
      setMessage(`Analysis refresh completed · ${result.snapshotCount} signals updated across ${result.batches} resumable batches.`);
      router.refresh();
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Analysis refresh failed.");
    } finally {
      setActive(null);
      setAnalysisProgress(null);
    }
  }

  async function runFullBackfill() {
    if (!window.confirm("Process every remaining Gmail archive batch? This can use OpenAI credits. Keep this tab open; progress is saved after every batch.")) return;
    stopRef.current = false;
    setActive("Full archive backfill");
    setMessage(null);
    setError(false);
    setProgress({ batches: 0, processed: 0, failedAttempts: 0, excluded: 0, pending: 0, deadLettered: 0, complete: false, stopped: false, lastRunId: null });
    try {
      const result = await runFullBackfillBatches({
        runBatch: async () => parseFullBackfillBatchResponse({ result: await post("/api/intelligence/sync", { mode: "backfill", maxMessages: 25 }) }),
        shouldStop: () => stopRef.current,
        onProgress: setProgress,
        waitBetweenBatches: () => new Promise((resolve) => window.setTimeout(resolve, 750)),
      });
      if (!result.stopped) await refreshSignals(setAnalysisProgress);
      setMessage(result.stopped
        ? `Backfill stopped safely after ${result.batches} batches. Run it again to resume.`
        : `Full archive backfill completed · ${result.processed} processed · ${result.failedAttempts} failed attempts.`);
      router.refresh();
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Backfill paused. Its checkpoint is saved.");
    } finally {
      setActive(null);
      setProgress(null);
      setAnalysisProgress(null);
    }
  }

  const busy = Boolean(active);
  return (
    <div className="border border-foreground bg-card p-5">
      <div>
        <p className="editorial-kicker">Manual controls</p>
        <h2 className="mt-1 font-heading text-2xl font-semibold">Run an automation now</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Normal collection and analysis run automatically. Use these controls only to test, catch up, or send the brief now.</p>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Button variant="outline" disabled={!gmailConnected || busy} onClick={() => run("Gmail sync", "/api/intelligence/sync", { mode: "incremental", maxMessages: 10 })}>
          <RefreshCw className={cn("size-4", active === "Gmail sync" && "animate-spin")} /> Sync Gmail now
        </Button>
        <Button variant="outline" disabled={!gmailConnected || (busy && active !== "Full archive backfill")} onClick={active === "Full archive backfill" ? () => { stopRef.current = true; } : runFullBackfill}>
          {active === "Full archive backfill" ? <Square className="size-4" /> : <Database className="size-4" />}
          {active === "Full archive backfill" ? "Stop after this batch" : "Full archive backfill"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={runRefresh}>
          <Activity className={cn("size-4", active === "Analysis refresh" && "animate-pulse")} /> Refresh analysis
        </Button>
        <Button disabled={busy} onClick={() => run("Morning brief", "/api/intelligence/digest")}>
          <Mail className="size-4" /> Send morning brief
        </Button>
      </div>
      {progress ? <p className="mt-4 text-sm" aria-live="polite">Full archive backfill · {progress.batches} batches · {progress.processed} processed · {progress.failedAttempts} failed attempts · {progress.pending} pending. Keep this tab open.</p> : null}
      {analysisProgress ? <p className="mt-4 text-sm" aria-live="polite">Analysis refresh · {analysisProgress.label} · {analysisProgress.processed} items checked across {analysisProgress.batches} batches. Keep this tab open.</p> : null}
      {message ? <p className={cn("mt-4 border-t border-border pt-3 text-sm", error && "text-destructive")} aria-live="polite">{message}</p> : null}
    </div>
  );
}

export function PromoteSourceButton({ sourceId }: { sourceId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  async function promote() {
    setState("working");
    try {
      await post(`/api/intelligence/sources/${encodeURIComponent(sourceId)}/promote`);
      setState("done");
      window.location.reload();
    } catch {
      setState("error");
    }
  }
  return (
    <div className="text-right">
      <Button size="sm" variant="outline" onClick={promote} disabled={state === "working" || state === "done"}>{state === "working" ? "Approving…" : state === "done" ? "Approved" : "Approve as regular source"}</Button>
      {state === "error" ? <p className="mt-1 text-xs text-destructive">Could not approve.</p> : null}
    </div>
  );
}
