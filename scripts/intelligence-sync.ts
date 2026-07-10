import "dotenv/config";

import { createAdminClient } from "../src/lib/supabase/admin";
import { getGmailSource, syncGmailSource, type GmailSyncMode } from "../src/lib/intelligence/jobs";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const mode = (argument("--mode") ?? "incremental") as GmailSyncMode;
  if (!(["backfill", "incremental", "discovery"] as string[]).includes(mode)) {
    throw new Error("--mode must be backfill, incremental, or discovery.");
  }
  const maxMessages = Math.max(1, Math.min(Number(argument("--batch") ?? 10), 25));
  const admin = createAdminClient();
  let source = await getGmailSource(admin, ownerId);
  if (!source) throw new Error("Connect Gmail in Crashboard before running the CLI sync.");

  let batch = 0;
  do {
    batch += 1;
    const result = await syncGmailSource(admin, source, {
      mode,
      maxMessages,
      windowStart: argument("--start"),
      windowEnd: argument("--end"),
      resetCheckpoint: batch === 1 && hasFlag("--reset"),
    });
    process.stdout.write(`${JSON.stringify({ batch, ...result })}\n`);
    if (!result.hasMore || !hasFlag("--all")) break;
    await new Promise((resolve) => setTimeout(resolve, 750));
    source = (await getGmailSource(admin, ownerId))!;
  } while (source);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
