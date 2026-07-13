import { describe, expect, it } from "vitest";
import { clearNewsletterBoilerplateReason } from "@/lib/intelligence/newsletter-boilerplate";

describe("clear newsletter boilerplate", () => {
  it.each([
    ["✉️ Wrapping Up", "Have questions, comments, or feedback? Just reply directly.", "footer_boilerplate"],
    ["DefenseTalks", "Secure your spot now! The event takes place in September.", "sponsored_content"],
    ["FedTalks", "Register now! Join senior leaders at the annual conference.", "sponsored_content"],
    ["Davos Daily", "Sign up for McKinsey's Davos Daily email series.", "sponsored_content"],
    ["Mind the Gap", "Welcome to the latest edition of Mind the Gap.", "navigation_boilerplate"],
  ])("classifies %s without relying on a generic topic word", (title, content, reason) => {
    expect(clearNewsletterBoilerplateReason(title, content)).toBe(reason);
  });

  it("preserves a legitimate system headline that reports registration as a fact", () => {
    expect(clearNewsletterBoilerplateReason(
      "Canada registers first F-35 training system",
      "The department recorded the system in its equipment register after acceptance testing.",
    )).toBeNull();
  });

  it("preserves a one-off procurement industry-day registration item", () => {
    expect(clearNewsletterBoilerplateReason(
      "Registration opens for defence procurement industry day",
      "Suppliers can register now for the buyer's industry day, where requirements and the competition timetable will be explained.",
    )).toBeNull();
  });
});
