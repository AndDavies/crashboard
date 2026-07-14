import type { SupabaseClient } from "@supabase/supabase-js";
import { isGenericEventTitle } from "@/lib/intelligence/event-action-qualification";

export const INTELLIGENCE_EVENT_DEDUP_VERSION = "event-dedup-v2.2.4";

export { isGenericEventTitle };

export type ActiveEventMembershipGeneration = {
  generationId: string;
  matchVersion: string;
  membershipCount: number;
  activatedAt: string | null;
};

type EventLike = {
  id?: unknown;
  cluster_id?: unknown;
};

type MembershipLike = {
  generation_id?: unknown;
  cluster_id?: unknown;
  event_id?: unknown;
  relationship?: unknown;
  match_version?: unknown;
};

type ActionRow = EventLike & Record<string, unknown>;

export function analyticalActionKeyByEventId(
  events: EventLike[],
  memberships: MembershipLike[],
  activeGeneration: ActiveEventMembershipGeneration | null,
) {
  const analyticalClusterByEvent = new Map(
    memberships
      .filter((row) =>
        activeGeneration &&
        row.match_version === activeGeneration.matchVersion &&
        String(row.generation_id) === activeGeneration.generationId
      )
      .map((row) => [String(row.event_id), String(row.cluster_id)]),
  );
  return new Map(events.map((event) => {
    const eventId = String(event.id);
    return [
      eventId,
      analyticalClusterByEvent.get(eventId) ?? String(event.cluster_id ?? eventId),
    ];
  }));
}

export function actionRowsByAnalyticalKey(
  actionKeys: string[],
  eventRows: ActionRow[],
  memberships: MembershipLike[],
  activeGeneration: ActiveEventMembershipGeneration | null,
) {
  const requested = new Set(actionKeys);
  const eventById = new Map(eventRows.map((row) => [String(row.id), row]));
  const rowsByKey = new Map<string, ActionRow>();

  // Singleton/current event IDs and legacy ingestion cluster IDs remain
  // resolvable so stored signal history does not break during rollout.
  for (const row of eventRows) {
    const eventId = String(row.id);
    const ingestionClusterId = String(row.cluster_id ?? "");
    if (requested.has(eventId)) rowsByKey.set(eventId, row);
    if (ingestionClusterId && requested.has(ingestionClusterId)) {
      rowsByKey.set(ingestionClusterId, row);
    }
  }

  for (const membership of memberships) {
    if (
      membership.match_version !== INTELLIGENCE_EVENT_DEDUP_VERSION ||
      !activeGeneration ||
      membership.match_version !== activeGeneration.matchVersion ||
      String(membership.generation_id) !== activeGeneration.generationId ||
      membership.relationship !== "canonical"
    ) continue;
    const clusterId = String(membership.cluster_id);
    if (!requested.has(clusterId)) continue;
    const event = eventById.get(String(membership.event_id));
    if (event) rowsByKey.set(clusterId, event);
  }
  return rowsByKey;
}

export function parseActiveEventMembershipGeneration(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const generationId = String(candidate.generation_id ?? "");
  const matchVersion = String(candidate.match_version ?? "");
  if (!generationId || !matchVersion) return null;
  const activatedAt = String(candidate.activated_at ?? "");
  return {
    generationId,
    matchVersion,
    membershipCount: Math.max(0, Math.floor(Number(
      candidate.membership_count ?? candidate.expected_membership_count ?? 0,
    ))),
    activatedAt: Number.isFinite(Date.parse(activatedAt)) ? activatedAt : null,
  } satisfies ActiveEventMembershipGeneration;
}

export async function loadActiveEventMembershipGeneration(
  admin: SupabaseClient,
  ownerId: string,
) {
  const result = await admin
    .from("intelligence_event_dedup_generations")
    .select("generation_id,match_version,expected_membership_count,activated_at")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .eq("match_version", INTELLIGENCE_EVENT_DEDUP_VERSION)
    .maybeSingle();
  if (result.error) {
    throw new Error(`Active event membership generation lookup failed: ${result.error.message}`);
  }
  return parseActiveEventMembershipGeneration(result.data);
}

/**
 * Loads one immutable event-membership generation by ID. Retired generations
 * intentionally remain readable so a resumable signal refresh and its stored
 * evidence can keep resolving the exact analytical action IDs they produced.
 */
export async function loadEventMembershipGeneration(
  admin: SupabaseClient,
  ownerId: string,
  generationId: string,
) {
  const normalizedGenerationId = generationId.trim();
  if (!normalizedGenerationId) return null;
  const result = await admin
    .from("intelligence_event_dedup_generations")
    .select("generation_id,match_version,expected_membership_count,activated_at")
    .eq("owner_id", ownerId)
    .eq("generation_id", normalizedGenerationId)
    .eq("match_version", INTELLIGENCE_EVENT_DEDUP_VERSION)
    .in("status", ["active", "retired"])
    .maybeSingle();
  if (result.error) {
    throw new Error(`Event membership generation lookup failed: ${result.error.message}`);
  }
  return parseActiveEventMembershipGeneration(result.data);
}
