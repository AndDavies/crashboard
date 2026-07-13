import type { SupabaseClient } from "@supabase/supabase-js";

type ResearchCompletionRow = {
  id: unknown;
  signal_kind: unknown;
  signal_id: unknown;
  what_changed: unknown;
  why_it_matters: unknown;
  evidence_effect: unknown;
  created_at: unknown;
  intelligence_research_leads: unknown;
};

export type CompletedResearchSummary = {
  id: string;
  signalLabel: string;
  completedAt: string;
  summary: string;
  assessmentChange?: "strengthened" | "weakened" | "unchanged";
  href: string;
};

export async function latestSentIntelligenceDigestAt(
  admin: SupabaseClient,
  ownerId: string,
) {
  const result = await admin
    .from("intelligence_digests")
    .select("sent_at")
    .eq("owner_id", ownerId)
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return typeof result.data?.sent_at === "string" ? result.data.sent_at : null;
}

function leadLabel(value: unknown) {
  const lead = Array.isArray(value) ? value[0] : value;
  if (!lead || typeof lead !== "object") return "";
  return String((lead as Record<string, unknown>).signal_label ?? "").trim();
}

export function completedResearchAfter(
  rows: ResearchCompletionRow[],
  lastDigestAt: string | null,
): CompletedResearchSummary[] {
  const cutoff = Date.parse(lastDigestAt ?? "");
  return rows
    .filter((row) => {
      const completedAt = Date.parse(String(row.created_at ?? ""));
      return Number.isFinite(completedAt) &&
        (!Number.isFinite(cutoff) || completedAt > cutoff);
    })
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, 8)
    .map((row) => {
      const kind = String(row.signal_kind ?? "topic");
      const signalId = String(row.signal_id ?? "");
      const effect = String(row.evidence_effect ?? "");
      const whatChanged = String(row.what_changed ?? "").trim();
      const whyItMatters = String(row.why_it_matters ?? "").trim();
      return {
        id: `research:${String(row.id)}`,
        signalLabel: leadLabel(row.intelligence_research_leads) || signalId,
        completedAt: String(row.created_at),
        summary: [whatChanged, whyItMatters].filter(Boolean).join(" "),
        ...(effect === "strengthened" || effect === "weakened" || effect === "unchanged"
          ? { assessmentChange: effect }
          : {}),
        href: `/dashboard/intelligence/explore?signal=${encodeURIComponent(`${kind}:${signalId}`)}`,
      };
    });
}

export async function loadResearchCompletedSinceLastBrief(
  admin: SupabaseClient,
  ownerId: string,
) {
  const lastDigestAt = await latestSentIntelligenceDigestAt(admin, ownerId);
  const result = await admin
    .from("intelligence_research_results")
    .select("id,signal_kind,signal_id,what_changed,why_it_matters,evidence_effect,created_at,intelligence_research_leads(signal_label)")
    .eq("owner_id", ownerId)
    .gt("created_at", lastDigestAt ?? "1970-01-01T00:00:00.000Z")
    .order("created_at", { ascending: false })
    .limit(8);
  if (result.error) throw new Error(result.error.message);
  return completedResearchAfter(
    (result.data ?? []) as unknown as ResearchCompletionRow[],
    lastDigestAt,
  );
}
