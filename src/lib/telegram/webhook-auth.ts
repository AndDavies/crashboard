/**
 * Telegram setWebhook `secret_token` is sent as `X-Telegram-Bot-Api-Secret-Token`.
 * @see https://core.telegram.org/bots/api#setwebhook
 */
export function verifyTelegramWebhookSecret(request: Request): {
  ok: true;
} | {
  ok: false;
  status: 401 | 503;
  message: string;
} {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      message: "TELEGRAM_WEBHOOK_SECRET is not configured.",
    };
  }

  const token = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
  if (token !== expected) {
    return { ok: false, status: 401, message: "Invalid webhook secret." };
  }

  return { ok: true };
}
