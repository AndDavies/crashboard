import { config } from "dotenv";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import {
  rebuildConceptCooccurrence,
  rebuildProcurementCases,
} from "../src/lib/intelligence/relationships";
import { refreshSignalSnapshots } from "../src/lib/intelligence/signal-refresh";

async function main() {
  const ownerId = process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Configure INTELLIGENCE_OWNER_ID.");
  const admin = createAdminClient();
  const procurement = await rebuildProcurementCases(admin, ownerId);
  const cooccurrence = await rebuildConceptCooccurrence(admin, ownerId);
  const signals = await refreshSignalSnapshots(admin, ownerId);
  process.stdout.write(`${JSON.stringify({ procurement, cooccurrence, signals })}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
