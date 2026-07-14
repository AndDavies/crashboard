import { afterEach, describe, expect, it } from "vitest";
import {
  createDashboardSession,
  isAllowedDashboardEmail,
  verifyDashboardSession,
} from "@/lib/dashboard-auth/session";

const originalSecret = process.env.DASHBOARD_SESSION_SECRET;
const originalAllowed = process.env.DASHBOARD_ALLOWED_EMAILS;

afterEach(() => {
  process.env.DASHBOARD_SESSION_SECRET = originalSecret;
  process.env.DASHBOARD_ALLOWED_EMAILS = originalAllowed;
});

describe("signed dashboard sessions", () => {
  it("accepts only an allowlisted Google identity", async () => {
    process.env.DASHBOARD_SESSION_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
    process.env.DASHBOARD_ALLOWED_EMAILS = "m.andrew.davies@gmail.com";
    const token = await createDashboardSession({
      id: "owner-1",
      email: "m.andrew.davies@gmail.com",
      name: "Andrew",
      picture: null,
    });
    await expect(verifyDashboardSession(token)).resolves.toMatchObject({
      id: "owner-1",
      email: "m.andrew.davies@gmail.com",
    });
    expect(isAllowedDashboardEmail("someone@example.com")).toBe(false);
  });

  it("rejects a modified session", async () => {
    process.env.DASHBOARD_SESSION_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
    process.env.DASHBOARD_ALLOWED_EMAILS = "m.andrew.davies@gmail.com";
    const token = await createDashboardSession({
      id: "owner-1",
      email: "m.andrew.davies@gmail.com",
      name: null,
      picture: null,
    });
    const parts = token.split(".");
    parts[1] = `${parts[1]!.startsWith("a") ? "b" : "a"}${parts[1]!.slice(1)}`;
    await expect(verifyDashboardSession(parts.join("."))).resolves.toBeNull();
  });
});
