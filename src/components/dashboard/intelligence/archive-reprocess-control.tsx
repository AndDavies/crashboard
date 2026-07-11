"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runBatchedTrendRefresh } from "@/lib/intelligence/trend-refresh-client";

type Progress = { complete: number; total: number; failed: number };

async function post(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    result?: Record<string, unknown>;
  };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.result ?? {};
}

export function ArchiveReprocessControl() {
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setConfirmed(false);
    setRunning(true);
    setResult(null);
    let offset = 0;
    let failed = 0;
    let remainingMissing = 0;
    try {
      while (true) {
        const batch = await post("/api/intelligence/reprocess", { offset, limit: 25 });
        offset = Number(batch.nextOffset ?? offset);
        failed += Number(batch.failed ?? 0);
        remainingMissing = Number(batch.remainingMissing ?? 0);
        setProgress({ complete: offset, total: Number(batch.total ?? offset), failed });
        if (!batch.hasMore) break;
      }
      try {
        await runBatchedTrendRefresh({
          runBatch: (body) => post("/api/intelligence/trends", body),
        });
        setResult(
          `Archive materialization complete: ${offset} documents visited, ${failed} batch failures, ${remainingMissing} records still missing analytics. Relationships and trend snapshots refreshed.`,
        );
      } catch (error) {
        setResult(
          `Archive materialization complete: ${offset} documents visited, ${failed} batch failures, ${remainingMissing} records still missing analytics. Trend refresh failed: ${error instanceof Error ? error.message : "Request failed."}`,
        );
      }
    } catch (error) {
      setResult(
        `Paused at ${offset}: ${error instanceof Error ? error.message : "Request failed."} Select resume to continue from the saved checkpoint.`,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5 border border-border bg-card p-5">
      <p className="text-sm leading-6 text-muted-foreground">
        Rebuilds source identities, article segments, canonical concepts, and long-tail facts while
        preserving existing enrichment. Every completed batch is checkpointed.
      </p>
      <Button
        disabled={running}
        onClick={() => {
          if (confirmed) void run();
          else setConfirmed(true);
        }}
      >
        <Sparkles className={running ? "size-4 animate-pulse" : "size-4"} />
        {running ? "Rebuilding archive" : confirmed ? "Confirm and resume" : "Resume archive rebuild"}
      </Button>
      {confirmed && !running ? (
        <p className="text-sm">Select <strong>Confirm and resume</strong> to continue from the saved checkpoint.</p>
      ) : null}
      {progress ? (
        <p className="font-mono text-sm" aria-live="polite">
          {progress.complete} / {progress.total} visited · {progress.failed} failed
        </p>
      ) : null}
      {result ? <p className="text-sm" aria-live="polite">{result}</p> : null}
      <Link href="/dashboard/intelligence" className="inline-block text-sm font-medium hover:text-accent">
        Return to intelligence overview
      </Link>
    </div>
  );
}
