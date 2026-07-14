import { config } from "dotenv";

config({ path: ".env.local" });

import { runResearchQueue } from "../src/lib/intelligence/research";
import {
  assertPaidOpenAiCliConfirmation,
  PAID_OPENAI_CONFIRMATION_FLAG,
} from "../src/lib/intelligence/local-openai-policy";
import { createAdminClient } from "../src/lib/supabase/admin";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const HELP = `Usage:
  npm run intelligence:research -- --owner <dashboard-user-id> ${PAID_OPENAI_CONFIRMATION_FLAG} [options]

This manual command can create leads, search the web, fetch sources, and make
paid OpenAI API calls. It refuses to start unless ${PAID_OPENAI_CONFIRMATION_FLAG} is present.

Options:
  --owner <id>          Supabase Auth user UUID (or INTELLIGENCE_OWNER_ID)
  --lead <id>           Run one existing research lead
  --limit <1-5>         Maximum leads to process (default: 5)
  --queued-only         Do not create automatic leads; process queued work only
  ${PAID_OPENAI_CONFIRMATION_FLAG}  Confirm that paid OpenAI use is intentional
  --help                Show this message without running research

This guard applies only to the manual CLI. Scheduled production research keeps
its existing feature flag, daily budget, and per-lead controls.
`;

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }
  assertPaidOpenAiCliConfirmation(process.argv);
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
