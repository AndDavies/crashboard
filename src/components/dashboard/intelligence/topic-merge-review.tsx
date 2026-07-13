"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, Split } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TopicMergeSuggestion } from "@/lib/intelligence/topic-merge-reviews";

type ReviewDecision = "approve" | "reject";

async function submitReview(suggestion: TopicMergeSuggestion, decision: ReviewDecision) {
  const response = await fetch(
    `/api/intelligence/topics/${encodeURIComponent(suggestion.id)}/merge-review`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, targetId: suggestion.targetId }),
    },
  );
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? `Topic review failed (HTTP ${response.status}).`);
  }
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count.toLocaleString("en-CA")} ${count === 1 ? singular : plural}`;
}

export function TopicMergeReview({ suggestions }: { suggestions: TopicMergeSuggestion[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState(suggestions);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisible(suggestions);
  }, [suggestions]);

  async function review(suggestion: TopicMergeSuggestion, decision: ReviewDecision) {
    if (
      decision === "approve" &&
      !window.confirm(
        `Merge “${suggestion.label}” into “${suggestion.targetLabel}”? Past evidence stays intact, and “${suggestion.targetLabel}” becomes the topic shown in future analysis.`,
      )
    ) return;

    setWorkingId(suggestion.id);
    setError(null);
    setMessage(null);
    try {
      await submitReview(suggestion, decision);
      setVisible((current) => current.filter((item) => item.id !== suggestion.id));
      setMessage(decision === "approve"
        ? `Merged “${suggestion.label}” into “${suggestion.targetLabel}”.`
        : `Kept “${suggestion.label}” and “${suggestion.targetLabel}” as separate topics.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Topic review failed.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section aria-labelledby="topic-decisions-heading">
      <div className="border-b border-foreground pb-3">
        <p className="editorial-kicker">Topic decisions</p>
        <h2 id="topic-decisions-heading" className="mt-1 font-heading text-2xl font-semibold">
          Possible duplicate topics
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          These topic names may describe the same thing. Nothing changes until you choose. Keeping them separate prevents this exact suggestion from returning.
        </p>
      </div>

      <div className="border-x border-b border-border">
        {visible.length ? visible.map((suggestion) => {
          const working = workingId === suggestion.id;
          return (
            <article key={suggestion.id} className="border-t border-border bg-card p-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {suggestion.domain ? <Badge variant="secondary">{suggestion.domain}</Badge> : null}
                    <span className="text-xs text-muted-foreground">
                      {countLabel(suggestion.supportItems, "coverage item", "coverage items")} across {countLabel(suggestion.sourceFamilies, "source", "sources")}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                    <div className="border border-border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New topic</p>
                      <p className="mt-1 font-heading text-lg font-semibold">{suggestion.label}</p>
                    </div>
                    <GitMerge aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                    <div className="border border-border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Possible match</p>
                      <p className="mt-1 font-heading text-lg font-semibold">{suggestion.targetLabel}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Their wording and supporting evidence are close enough to need your decision. If merged, past evidence remains available and future analysis uses the possible match as the main topic.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                  <Button
                    size="sm"
                    onClick={() => review(suggestion, "approve")}
                    disabled={Boolean(workingId)}
                  >
                    <GitMerge className="size-4" /> {working ? "Merging…" : "Merge these topics"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review(suggestion, "reject")}
                    disabled={Boolean(workingId)}
                  >
                    <Split className="size-4" /> {working ? "Saving…" : "Keep separate"}
                  </Button>
                </div>
              </div>
            </article>
          );
        }) : (
          <p className="border-t border-border bg-card px-5 py-8 text-sm text-muted-foreground">
            No topic decisions are waiting.
          </p>
        )}
      </div>
      {message ? <p className="mt-3 text-sm" aria-live="polite">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
