import { config } from "dotenv";

config({ path: ".env.local" });

import {
  collectExternalSources,
  seedOfficialSourceCandidates,
} from "../src/lib/intelligence/collectors";
import { createAdminClient } from "../src/lib/supabase/admin";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const admin = createAdminClient();
  if (process.argv.includes("--seed-official")) {
    const result = await seedOfficialSourceCandidates(admin, ownerId);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const result = await collectExternalSources(admin, ownerId, {
    sourceId: argument("--source"),
    pageLimit: Number(argument("--limit") ?? 25),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

