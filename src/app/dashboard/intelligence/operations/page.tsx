import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { OperationsControls } from "@/components/dashboard/intelligence/operations-controls";
import { getIntelligenceOperations } from "@/lib/intelligence/data";
import type { IntelligenceRunDiagnostic } from "@/lib/intelligence/types";

export const metadata: Metadata = { title: "Intelligence Operations · Crashboard" };
export const dynamic = "force-dynamic";

function timestamp(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Halifax",
  }).format(new Date(value));
}

function elapsedLabel(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function runStatusVariant(run: IntelligenceRunDiagnostic) {
  if (run.isStale || run.status === "failed" || run.status === "cancelled") {
    return "destructive" as const;
  }
  if (run.status === "completed") return "default" as const;
  if (run.status === "partial") return "secondary" as const;
  return "outline" as const;
}

export default async function IntelligenceOperationsPage() {
  const data = await getIntelligenceOperations();

  return (
    <div className="space-y-8 pb-14">
      <section className="border-b border-foreground/80 pb-6">
        <p className="editorial-kicker">Trend intelligence / operations</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold">
          Sources, checkpoints, runs, and watchlists.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Every ingestion batch is resumable and accounted for. Run diagnostics expose progress,
          elapsed time, heartbeats, and the exact failure returned by the pipeline.
        </p>
      </section>

      <section>
        <div className="border-b border-foreground/80 pb-3">
          <p className="editorial-kicker">Source registry</p>
          <h2 className="mt-1 font-heading text-2xl font-semibold">
            Connected and discovered sources
          </h2>
        </div>
        <div className="border-x border-b border-border">
          {data.sources.length ? (
            data.sources.map((source) => {
              const config = (source.config ?? {}) as Record<string, unknown>;
              const candidates = Array.isArray(config.candidate_senders)
                ? config.candidate_senders.length
                : 0;
              const checkpoint = (source.checkpoint ?? {}) as Record<string, unknown>;
              const modeValues =
                checkpoint.modes && typeof checkpoint.modes === "object"
                  ? Object.values(checkpoint.modes as Record<string, unknown>)
                  : [checkpoint];
              const modeCheckpoints = modeValues.filter(
                (value): value is Record<string, unknown> =>
                  Boolean(value) && typeof value === "object" && !Array.isArray(value),
              );
              const pendingMessages = modeCheckpoints.reduce(
                (total, value) =>
                  total +
                  (Array.isArray(value.pending_message_ids)
                    ? value.pending_message_ids.length
                    : 0),
                0,
              );
              const deadLetterMessages = new Set(
                modeCheckpoints.flatMap((value) =>
                  Array.isArray(value.dead_letter_message_ids)
                    ? value.dead_letter_message_ids.map(String)
                    : [],
                ),
              ).size;
              const activeModes = modeCheckpoints
                .filter(
                  (value) =>
                    value.complete === false || Boolean(value.next_page_token),
                )
                .map((value) => String(value.mode ?? "unknown"));
              const checkpointActive = activeModes.length > 0;
              return (
                <div
                  key={source.id}
                  className="grid gap-3 border-t border-border bg-card p-4 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-lg font-semibold">{source.name}</h3>
                      <Badge variant={source.status === "active" ? "default" : "outline"}>
                        {source.status}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {source.source_type} · {candidates} candidate senders ·{" "}
                      {checkpointActive
                        ? `${activeModes.join(", ")} checkpoint active`
                        : "checkpoint clear"} · {pendingMessages} pending · {deadLetterMessages}{" "}
                      dead-lettered
                    </p>
                    {source.last_error ? (
                      <p className="mt-2 text-sm text-destructive">{source.last_error}</p>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground md:text-right">
                    {source.last_synced_at
                      ? timestamp(String(source.last_synced_at), "Never synced")
                      : "Never synced"}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
              No connected sources.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="border-b border-foreground/80 pb-3">
          <p className="editorial-kicker">Watchlists</p>
          <h2 className="mt-1 font-heading text-2xl font-semibold">
            Saved intelligence questions
          </h2>
        </div>
        <div className="mt-4">
          <OperationsControls watchlists={data.watchlists as never[]} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div>
          <div className="border-b border-foreground/80 pb-3">
            <p className="editorial-kicker">Run ledger</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">Recent ingestion</h2>
          </div>
          <div className="border-x border-b border-border">
            {data.runs.length ? (
              data.runs.slice(0, 20).map((run) => (
                <div key={run.id} className="border-t border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="capitalize font-medium">
                      {run.runType.replaceAll("_", " ")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={runStatusVariant(run)}>{run.status}</Badge>
                      {run.isStale ? <Badge variant="destructive">stale</Badge> : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-y border-border py-3 font-mono text-xs text-muted-foreground sm:grid-cols-4">
                    <span>{run.discoveredCount} discovered</span>
                    <span>{run.processedCount} processed</span>
                    <span>{run.failedCount} failed</span>
                    <span>{run.excludedCount} excluded</span>
                  </div>

                  <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="mt-0.5 font-mono">{timestamp(run.createdAt, "Unknown")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Started</dt>
                      <dd className="mt-0.5 font-mono">
                        {timestamp(run.startedAt, "Not started")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last activity</dt>
                      <dd className="mt-0.5 font-mono">
                        {timestamp(run.heartbeatAt, "No heartbeat")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Completed</dt>
                      <dd className="mt-0.5 font-mono">
                        {timestamp(run.completedAt, "Not completed")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Elapsed</dt>
                      <dd className="mt-0.5 font-mono">{elapsedLabel(run.elapsedSeconds)}</dd>
                    </div>
                  </dl>

                  {run.errorSummary ? (
                    <p className="mt-3 break-words border-t border-border pt-3 text-sm leading-6 text-destructive">
                      {run.errorSummary}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
                No runs yet.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="border-b border-foreground/80 pb-3">
            <p className="editorial-kicker">Digest ledger</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold">Daily delivery</h2>
          </div>
          <div className="border-x border-b border-border">
            {data.digests.length ? (
              data.digests.map((digest) => (
                <div key={digest.id} className="border-t border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{digest.subject}</span>
                    <Badge variant={digest.status === "failed" ? "destructive" : "outline"}>
                      {digest.status}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {digest.sent_at
                      ? timestamp(String(digest.sent_at), String(digest.digest_date))
                      : digest.digest_date}
                  </p>
                  {digest.error_message ? (
                    <p className="mt-2 text-sm text-destructive">{digest.error_message}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
                No digests yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
