import { config } from "dotenv";

config({ path: ".env.local" });

import { runResearchQueue } from "../src/lib/intelligence/research";
import { createAdminClient } from "../src/lib/supabase/admin";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const result = await runResearchQueue(createAdminClient(), ownerId, {
    leadId: argument("--lead"),
    createAutomatic: !process.argv.includes("--queued-only"),
    maxLeads: Number(argument("--limit") ?? 5),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

