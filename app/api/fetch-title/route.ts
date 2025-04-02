import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const { url } = await request.json();

  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
    const title = ogTitleMatch?.[1] || titleMatch?.[1] || "Untitled";

    return NextResponse.json({ title });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json({ title: "Untitled" });
  }
}