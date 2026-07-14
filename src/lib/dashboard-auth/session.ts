import { SignJWT, jwtVerify } from "jose";

export const DASHBOARD_SESSION_COOKIE = "crashboard-dashboard-session";
export const DASHBOARD_SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export type DashboardUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export function dashboardUsesGoogleAuth() {
  return process.env.DASHBOARD_AUTH_MODE?.trim().toLocaleLowerCase() === "google";
}

function sessionSecret() {
  const value = process.env.DASHBOARD_SESSION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

export function dashboardAllowedEmails() {
  const configured = process.env.DASHBOARD_ALLOWED_EMAILS?.trim();
  const values = configured
    ? configured.split(",")
    : [process.env.INTELLIGENCE_OWNER_EMAIL?.trim() || "m.andrew.davies@gmail.com"];
  return new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
}

export function isAllowedDashboardEmail(email: string) {
  return dashboardAllowedEmails().has(email.trim().toLocaleLowerCase());
}

export async function createDashboardSession(user: DashboardUser) {
  if (!isAllowedDashboardEmail(user.email)) throw new Error("This Google account is not allowed.");
  return new SignJWT({
    email: user.email.toLocaleLowerCase(),
    name: user.name,
    picture: user.picture,
    uid: user.id,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("crashboard.dev")
    .setAudience("crashboard-dashboard")
    .setSubject(user.id)
    .setExpirationTime(`${DASHBOARD_SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

export async function verifyDashboardSession(token: string | null | undefined): Promise<DashboardUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: "crashboard.dev",
      audience: "crashboard-dashboard",
      algorithms: ["HS256"],
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    const id = typeof payload.uid === "string" ? payload.uid : payload.sub ?? "";
    if (!email || !id || !isAllowedDashboardEmail(email)) return null;
    return {
      id,
      email,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export const dashboardSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DASHBOARD_SESSION_MAX_AGE,
  priority: "high" as const,
};
