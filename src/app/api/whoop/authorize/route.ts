import { buildWhoopAuthorizationUrl } from "@/lib/whoop/oauth";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

/**
 * Starts the WHOOP OAuth flow (dashboard only): requires a Supabase session,
 * sets `state` cookie (CSRF), redirects to WHOOP.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", "/dashboard/whoop");
    return NextResponse.redirect(login);
  }

  let authUrl: string;
  const state = randomBytes(12).toString("hex");

  try {
    authUrl = buildWhoopAuthorizationUrl(state);
  } catch {
    return NextResponse.json(
      { error: "WHOOP OAuth is not configured (client id / redirect URI)." },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
