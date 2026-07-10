import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { gmailAuthorizationUrl } from "@/lib/intelligence/gmail";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireDashboardUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const state = randomBytes(32).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set("crashboard-gmail-oauth-state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/intelligence/google/callback",
      maxAge: 600,
    });
    return NextResponse.redirect(gmailAuthorizationUrl(state, user.email));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Gmail OAuth." },
      { status: 503 },
    );
  }
}
