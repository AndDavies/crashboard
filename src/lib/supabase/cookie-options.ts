import type { CookieOptionsWithName } from "@supabase/ssr";

/** Keep auth cookies for a long time; refresh tokens rotate via middleware. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const supabaseCookieOptions: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: ONE_YEAR_SECONDS,
};
