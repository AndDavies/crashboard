import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dashboardGoogleAuthorizationUrl } from "@/lib/dashboard-auth/google";

export const runtime = "nodejs";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard/intelligence";
}

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(32).toString("base64url");
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    const response = NextResponse.redirect(
      dashboardGoogleAuthorizationUrl(state, request.nextUrl.origin, "m.andrew.davies@gmail.com"),
    );
    response.cookies.set("crashboard-google-auth-state", state, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/api/auth/google/callback", maxAge: 600,
    });
    response.cookies.set("crashboard-google-auth-next", next, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/api/auth/google/callback", maxAge: 600,
    });
    return response;
  } catch (error) {
    console.error("[auth] Could not start Google sign-in.", error);
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }
}
