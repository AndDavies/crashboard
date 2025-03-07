import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  const logPath = path.join(process.cwd(), "app/scrapers/logo/scrape_log.json");
  try {
    const data = await fs.readFile(logPath, "utf8");
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    return NextResponse.json([]);
  }
}