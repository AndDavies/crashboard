import { config } from "dotenv";
import { createInterface } from "node:readline";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { processIntelligenceDocument } from "../src/lib/intelligence/pipeline";
import type { IntelligenceDocumentEnvelope } from "../src/lib/intelligence/types";

type ConnectorEmail = {
  id: string;
  thread_id?: string;
  from_?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  labels?: string[];
  email_ts?: string;
  display_url?: string;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sender(value: string) {
  const email = value.match(/<([^>]+)>/u)?.[1] ?? value.match(/[\w.+-]+@[\w.-]+/u)?.[0] ?? "";
  const name = value.replace(email, "").replace(/[<>\"]/g, "").trim() || email || "Unknown newsletter";
  return { name, email };
}

function links(value: string) {
  return [...new Set([...value.matchAll(/\((https?:\/\/[^)]+)\)/giu)].map((match) => match[1]))];
}

function canonicalLink(value: string) {
  return (
    links(value).find((link) => {
      const normalized = link.toLowerCase();
      return !/(mail\.google|unsubscribe|preferences|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com)/u.test(normalized);
    }) ?? null
  );
}

async function readStdin() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    lines.close();
    return line;
  }
  return "";
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const input = JSON.parse(await readStdin()) as ConnectorEmail[];
  if (!Array.isArray(input)) throw new Error("Expected a JSON array on stdin.");
  const admin = createAdminClient();
  const summary = { received: input.length, processed: 0, failed: 0, events: 0 };

  for (const email of input) {
    const from = sender(email.from_ ?? "");
    const envelope: IntelligenceDocumentEnvelope = {
      ownerId,
      sourceType: "email_newsletter",
      externalId: email.id,
      originalUrl: email.display_url ?? `https://mail.google.com/mail/u/0/#all/${email.id}`,
      canonicalUrl: canonicalLink(email.body ?? ""),
      title: email.subject ?? "Untitled newsletter",
      authorName: from.name,
      publisherName: from.name,
      language: "en",
      publishedAt: email.email_ts ? new Date(email.email_ts).toISOString() : null,
      contentText: email.body?.trim() || email.snippet?.trim() || "[No readable body content]",
      summaryShort: email.snippet ?? null,
      sourceChannel: "gmail_connector_bootstrap",
      labels: email.labels ?? [],
      metadata: {
        gmail_thread_id: email.thread_id ?? null,
        sender_email: from.email,
        connector_bootstrap: true,
        extracted_links: links(email.body ?? ""),
      },
    };
    try {
      const result = await processIntelligenceDocument(admin, envelope, {
        openaiApiKey: process.env.OPENAI_API_KEY,
      });
      summary.processed += 1;
      summary.events += result.eventCount;
    } catch (error) {
      summary.failed += 1;
      console.error(`[intelligence-import] ${email.id}:`, error instanceof Error ? error.message : error);
    }
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
