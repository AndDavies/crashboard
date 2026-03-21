import { cookies } from "next/headers";

const WHOOP_ACCESS_COOKIE = "whoop_access_token";

/** True when the OAuth callback has stored a WHOOP access token (httpOnly cookie). */
export async function isWhoopConnected(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(WHOOP_ACCESS_COOKIE)?.value);
}
