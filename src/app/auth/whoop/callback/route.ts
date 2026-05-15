import {
  exchangeWhoopAuthorizationCode,
  getWhoopRedirectUri,
} from "@/lib/whoop/oauth";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * WHOOP OAuth redirect / callback URL.
 *
 * Production (crashboard.dev): register exactly
 *   https://crashboard.dev/auth/whoop/callback
 * Local dev: http://localhost:3000/auth/whoop/callback (set WHOOP_REDIRECT_URI or NEXT_PUBLIC_SITE_URL).
 *
 * Must match `WHOOP_REDIRECT_URI` (or derived URL) character-for-character.
 * @see https://developer.whoop.com/docs/developing/oauth/#redirect-url
 */
function clearWhoopStateCookie(res: NextResponse) {
  res.cookies.set("whoop_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");

  const redirectBase = `${origin}/dashboard/content/blog`;
  const loginWhoopFinish = () => {
    const url = new URL("/login", origin);
    url.searchParams.set("next", "/dashboard/content/blog");
    url.searchParams.set("error", "whoop_session");
    return url;
  };

  if (error) {
    const msg = errorDescription || error;
    return NextResponse.redirect(
      `${redirectBase}?whoop_error=${encodeURIComponent(msg)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${redirectBase}?whoop_error=${encodeURIComponent("missing authorization code")}`,
    );
  }

  const returnedState = searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("whoop_oauth_state")?.value;
  if (
    !returnedState ||
    !expectedState ||
    returnedState !== expectedState
  ) {
    return NextResponse.redirect(
      `${redirectBase}?whoop_error=${encodeURIComponent("invalid or missing OAuth state — use Connect WHOOP on the dashboard")}`,
    );
  }

  if (!getWhoopRedirectUri()) {
    return NextResponse.redirect(
      `${redirectBase}?whoop_error=${encodeURIComponent("WHOOP redirect URL is not configured")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const res = NextResponse.redirect(loginWhoopFinish());
    clearWhoopStateCookie(res);
    return res;
  }

  try {
    const tokens = await exchangeWhoopAuthorizationCode(code);
    const res = NextResponse.redirect(`${redirectBase}?whoop_connected=1`);

    clearWhoopStateCookie(res);

    res.cookies.set("whoop_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60, tokens.expires_in - 60),
    });

    if (tokens.refresh_token) {
      res.cookies.set("whoop_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
    }

    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "token exchange failed";
    console.error("[whoop/callback]", message);
    return NextResponse.redirect(
      `${redirectBase}?whoop_error=${encodeURIComponent(message)}`,
    );
  }
}
