/**
 * Shared helpers for `Authorization: Bearer <secret>` gates on API routes.
 */

/** Require a configured env secret and a matching Bearer token. */
export function requireBearerSecret(
  request: Request,
  secretFromEnv: string | undefined,
  envVarName: string,
):
  | { ok: true; secret: string }
  | { ok: false; status: number; message: string } {
  const secret = secretFromEnv?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: `${envVarName} is not configured; this endpoint is disabled.`,
    };
  }
  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }
  return { ok: true, secret };
}

/**
 * Optional gate: if `secretFromEnv` is set, require matching Bearer; if unset, allow.
 * (Used by direct `/api/ingestion` for local dev convenience.)
 */
export function verifyOptionalBearerSecret(
  request: Request,
  secretFromEnv: string | undefined,
): boolean {
  const secret = secretFromEnv?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}
