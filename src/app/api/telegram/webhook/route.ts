import { orchestrateTelegramUrlIngestion } from "@/lib/telegram";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/webhook-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Telegram Bot webhook. Always responds 200 for well-formed callbacks (after auth)
 * so Telegram does not retry storms; errors are described in the JSON body.
 */
export async function POST(request: Request) {
  const auth = verifyTelegramWebhookSecret(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.message },
      { status: auth.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({
      ok: true,
      telegram: { ignored: true, reason: "invalid_json" },
    });
  }

  try {
    const admin = createAdminClient();
    const summary = await orchestrateTelegramUrlIngestion(body, admin);
    return NextResponse.json({
      ok: true,
      telegram: summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_error";
    console.error("[telegram/webhook]", message);
    return NextResponse.json({
      ok: true,
      telegram: { handled: false, ignoredReason: "internal_error", message },
    });
  }
}
