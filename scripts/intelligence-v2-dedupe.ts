import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

import { rebuildStoryAndEventClustersV2 } from "../src/lib/intelligence/dedup-v2";
import { disableOpenAiApiForLocalRun } from "../src/lib/intelligence/local-openai-policy";
import { latestCompleteDateKey } from "../src/lib/intelligence/signal-metrics";
import {
  releaseSignalRefreshLease,
  requireSignalRefreshLease,
} from "../src/lib/intelligence/signal-refresh-lease";
import { createAdminClient } from "../src/lib/supabase/admin";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validDateOnly(value: unknown) {
  const candidate = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : undefined;
}

async function main() {
  // This command is deliberately deterministic. Clearing the inherited key
  // protects the contract if deduplication gains additional imports later.
  disableOpenAiApiForLocalRun();

  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");

  const requestedCompleteThrough = argument("--complete-through");
  const completeThrough = requestedCompleteThrough
    ? validDateOnly(requestedCompleteThrough)
    : latestCompleteDateKey();
  if (!completeThrough) {
    throw new Error("--complete-through must be a real date in YYYY-MM-DD format.");
  }
  const latestComplete = latestCompleteDateKey();
  if (completeThrough > latestComplete) {
    throw new Error(
      `--complete-through cannot be later than the latest complete Halifax day (${latestComplete}).`,
    );
  }

  const admin = createAdminClient();
  const lease = {
    leaseToken: randomUUID(),
    holderRunId: randomUUID(),
    holderKind: "local_validation" as const,
  };
  await requireSignalRefreshLease(admin, {
    ownerId,
    ...lease,
    ttlSeconds: 1_800,
  });
  try {
    console.log(`Rebuilding Intelligence v2 story and event clusters through ${completeThrough}.`);
    const result = await rebuildStoryAndEventClustersV2(
      admin,
      ownerId,
      { completeThrough, lease },
    );
    console.log("Intelligence v2 deduplication complete.", result);
  } finally {
    await releaseSignalRefreshLease(admin, {
      ownerId,
      leaseToken: lease.leaseToken,
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
