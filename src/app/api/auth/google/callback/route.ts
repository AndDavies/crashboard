import { NextResponse, type NextRequest } from "next/server";
import { exchangeDashboardGoogleCode } from "@/lib/dashboard-auth/google";
import {
  createDashboardSession,
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionCookieOptions,
  isAllowedDashboardEmail,
} from "@/lib/dashboard-auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get("crashboard-google-auth-state")?.value;
  const next = request.cookies.get("crashboard-google-auth-next")?.value || "/dashboard/intelligence";
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!expectedState || !state || expectedState !== state || !code) {
    return NextResponse.redirect(new URL("/login?error=state", request.url));
  }
  try {
    const user = await exchangeDashboardGoogleCode(code, request.nextUrl.origin);
    if (!isAllowedDashboardEmail(user.email)) {
      return NextResponse.redirect(new URL("/login?error=account", request.url));
    }
    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.set(DASHBOARD_SESSION_COOKIE, await createDashboardSession(user), dashboardSessionCookieOptions);
    response.cookies.delete("crashboard-google-auth-state");
    response.cookies.delete("crashboard-google-auth-next");
    return response;
  } catch (error) {
    console.error("[auth] Google callback failed.", error);
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }
}
