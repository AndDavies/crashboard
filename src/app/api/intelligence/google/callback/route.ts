import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeGmailAuthorizationCode,
  getGmailProfile,
} from "@/lib/intelligence/gmail";
import { encryptCredential } from "@/lib/intelligence/oauth-crypto";
import {
  encryptedCredentialColumns,
  getGmailSource,
} from "@/lib/intelligence/jobs";
import { getTursoIntelligenceStore, intelligenceUsesTurso } from "@/lib/intelligence/store";
import { intelligenceOwnerIdForUser } from "@/lib/intelligence/owner";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireDashboardUser().catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("crashboard-gmail-oauth-state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  cookieStore.delete("crashboard-gmail-oauth-state");
  if (!expectedState || !state || expectedState !== state || !code) {
    return NextResponse.redirect(
      new URL("/dashboard/intelligence?gmail=invalid_oauth_state", request.url),
    );
  }

  try {
    const tokens = await exchangeGmailAuthorizationCode(code);
    const store = intelligenceUsesTurso() ? getTursoIntelligenceStore() : null;
    const admin = store ? null : createAdminClient();
    const intelligenceOwnerId = intelligenceOwnerIdForUser(user);
    const existing = store
      ? await store.getSource(intelligenceOwnerId, "gmail")
      : await getGmailSource(admin!, user.id);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken && existing) {
      return NextResponse.redirect(
        new URL("/dashboard/intelligence?gmail=already_connected", request.url),
      );
    }
    if (!refreshToken) throw new Error("Google did not return an offline refresh token.");

    const profile = await getGmailProfile(tokens.access_token);
    const encrypted = encryptCredential({
      refreshToken,
      email: profile.emailAddress,
      scope: tokens.scope,
    });
    if (store) {
      await store.upsertSource({
        ownerId: intelligenceOwnerId,
        sourceType: "gmail",
        externalKey: profile.emailAddress.toLocaleLowerCase(),
        name: `Gmail · ${profile.emailAddress}`,
        status: "active",
        config: { account_email: profile.emailAddress },
        credential: encrypted,
        checkpoint: existing?.checkpoint ?? {},
      });
      return NextResponse.redirect(
        new URL("/dashboard/intelligence?gmail=connected", request.url),
      );
    }
    const upsert = await admin!.from("intelligence_sources").upsert(
      {
        owner_id: user.id,
        source_type: "gmail",
        name: `Gmail · ${profile.emailAddress}`,
        external_key: profile.emailAddress.toLowerCase(),
        status: "active",
        config: { account_email: profile.emailAddress },
        checkpoint: {},
        last_error: null,
        ...encryptedCredentialColumns(encrypted),
      },
      { onConflict: "owner_id,source_type,external_key" },
    );
    if (upsert.error) throw new Error(upsert.error.message);
    return NextResponse.redirect(
      new URL("/dashboard/intelligence?gmail=connected", request.url),
    );
  } catch (error) {
    console.error("[intelligence] Gmail OAuth callback failed.", error);
    return NextResponse.redirect(
      new URL("/dashboard/intelligence?gmail=connection_failed", request.url),
    );
  }
}
