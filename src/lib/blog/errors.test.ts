import { describe, expect, it } from "vitest";
import { isTransientPublicContentError } from "@/lib/blog/errors";

describe("public content outage handling", () => {
  it("recognizes provider and network outages", () => {
    expect(isTransientPublicContentError({ message: "supabase.co | 521: Web server is down" })).toBe(true);
    expect(isTransientPublicContentError(new Error("Connection terminated due to connection timeout"))).toBe(true);
    expect(isTransientPublicContentError(new Error("fetch failed"))).toBe(true);
    expect(isTransientPublicContentError(new Error("The operation was aborted due to timeout"))).toBe(true);
  });

  it("does not hide data, authorization, or application errors", () => {
    expect(isTransientPublicContentError({ message: "permission denied for table blog_posts" })).toBe(false);
    expect(isTransientPublicContentError({ message: "invalid input syntax for uuid" })).toBe(false);
  });
});
