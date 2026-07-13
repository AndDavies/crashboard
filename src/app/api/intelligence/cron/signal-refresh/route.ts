import type { NextRequest } from "next/server";
import { GET as runSignalRefresh } from "@/app/api/intelligence/cron/trends/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return runSignalRefresh(request);
}

