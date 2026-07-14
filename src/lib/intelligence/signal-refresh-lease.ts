import type { SupabaseClient } from "@supabase/supabase-js";

export const SIGNAL_REFRESH_LEASE_TTL_SECONDS = 900;
export type SignalRefreshLeaseHolderKind = "scheduled" | "local_validation";

type DbObject = Record<string, unknown>;

function object(value: unknown): DbObject {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? candidate as DbObject
    : {};
}

export function parseSignalRefreshLease(value: unknown) {
  const result = object(value);
  const expiresAt = String(result.expires_at ?? "");
  return {
    claimed: result.claimed === true,
    holderRunId: String(result.holder_run_id ?? ""),
    holderKind: String(result.holder_kind ?? ""),
    expiresAt: Number.isFinite(Date.parse(expiresAt)) ? expiresAt : null,
  };
}

export async function claimSignalRefreshLease(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    leaseToken: string;
    holderRunId: string;
    holderKind: SignalRefreshLeaseHolderKind;
    ttlSeconds?: number;
  },
) {
  const result = await admin.rpc("claim_intelligence_signal_refresh_lease", {
    query_owner: input.ownerId,
    query_lease_token: input.leaseToken,
    query_holder_run_id: input.holderRunId,
    query_holder_kind: input.holderKind,
    query_ttl_seconds: Math.min(
      1800,
      Math.max(300, Math.floor(input.ttlSeconds ?? SIGNAL_REFRESH_LEASE_TTL_SECONDS)),
    ),
  });
  if (result.error) {
    throw new Error(`Signal refresh lease claim failed: ${result.error.message}`);
  }
  return parseSignalRefreshLease(result.data);
}

export async function requireSignalRefreshLease(
  admin: SupabaseClient,
  input: Parameters<typeof claimSignalRefreshLease>[1],
) {
  const lease = await claimSignalRefreshLease(admin, input);
  if (!lease.claimed) {
    throw new Error(
      `Signal refresh lease is held by ${lease.holderKind || "another"} run ${lease.holderRunId || "unknown"}.`,
    );
  }
  return lease;
}

export async function releaseSignalRefreshLease(
  admin: SupabaseClient,
  input: { ownerId: string; leaseToken: string },
) {
  const result = await admin.rpc("release_intelligence_signal_refresh_lease", {
    query_owner: input.ownerId,
    query_lease_token: input.leaseToken,
  });
  if (result.error) {
    throw new Error(`Signal refresh lease release failed: ${result.error.message}`);
  }
  return result.data === true;
}
