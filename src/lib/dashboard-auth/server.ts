import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  DASHBOARD_SESSION_COOKIE,
  verifyDashboardSession,
} from "./session";

export const getDashboardUser = cache(async () => {
  const token = (await cookies()).get(DASHBOARD_SESSION_COOKIE)?.value;
  return verifyDashboardSession(token);
});

export async function requireSignedDashboardUser() {
  const user = await getDashboardUser();
  if (!user) throw new Error("Authentication required.");
  return user;
}
