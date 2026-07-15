import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalIntelligenceOwnerId,
  intelligenceOwnerIdForUser,
} from "./owner";

const originalEmail = process.env.INTELLIGENCE_OWNER_EMAIL;
const originalLegacyOwner = process.env.INTELLIGENCE_OWNER_ID;

afterEach(() => {
  if (originalEmail === undefined) delete process.env.INTELLIGENCE_OWNER_EMAIL;
  else process.env.INTELLIGENCE_OWNER_EMAIL = originalEmail;
  if (originalLegacyOwner === undefined) delete process.env.INTELLIGENCE_OWNER_ID;
  else process.env.INTELLIGENCE_OWNER_ID = originalLegacyOwner;
});

describe("canonical Intelligence owner identity", () => {
  it("normalizes the dashboard email and ignores legacy database IDs", () => {
    process.env.INTELLIGENCE_OWNER_ID = "legacy-supabase-uuid";
    expect(intelligenceOwnerIdForUser({ email: "M.Andrew.Davies@gmail.com" }))
      .toBe("google:m.andrew.davies@gmail.com");
  });

  it("uses the configured owner email for local worker commands", () => {
    process.env.INTELLIGENCE_OWNER_EMAIL = "Andrew@example.com";
    expect(canonicalIntelligenceOwnerId()).toBe("google:andrew@example.com");
  });
});
