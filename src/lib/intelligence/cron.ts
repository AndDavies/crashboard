import "server-only";

import type { NextRequest } from "next/server";
import { requireBearerSecret } from "@/lib/http/verify-bearer-secret";

export function verifyIntelligenceCron(request: NextRequest) {
  return requireBearerSecret(
    request,
    process.env.CRON_SECRET ?? process.env.INTELLIGENCE_JOB_SECRET,
    "CRON_SECRET",
  );
}

export function isHalifaxHour(hour: number, anchor = new Date()) {
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Halifax",
    hour: "2-digit",
    hour12: false,
  }).format(anchor);
  return Number(value) === hour;
}

export function cronOwnerId() {
  const ownerId = process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("INTELLIGENCE_OWNER_ID is not configured.");
  return ownerId;
}
