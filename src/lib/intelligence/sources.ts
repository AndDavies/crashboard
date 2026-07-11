import { normalizeConceptKey } from "@/lib/intelligence/concepts";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

const FAMILY_RULES: Array<{ pattern: RegExp; family: string }> = [
  { pattern: /^tldr(?:\b|\s)/iu, family: "TLDR" },
  { pattern: /^dark reading(?:\b|\s)/iu, family: "Dark Reading" },
  { pattern: /^breaking defen[cs]e(?:\b|\s)/iu, family: "Breaking Defense" },
  { pattern: /^pitchbook(?:\b|\s)/iu, family: "PitchBook" },
  { pattern: /^the hacker news(?:\b|\s)/iu, family: "The Hacker News" },
];

export function sourceFamilyName(value: string) {
  const cleaned = value.trim() || "Unknown source";
  return FAMILY_RULES.find((rule) => rule.pattern.test(cleaned))?.family ?? cleaned;
}

export function sourceIdentityDescriptor(document: IntelligenceDocumentEnvelope) {
  const canonicalName =
    document.publisherName?.trim() || document.authorName?.trim() || "Unknown source";
  const family = sourceFamilyName(canonicalName);
  const authorityTier =
    document.sourceType === "official_release" || document.sourceType === "procurement_notice"
      ? "primary"
      : document.sourceType === "reddit_post" || document.sourceType === "social_post"
        ? "community"
        : /^(?:tldr|the hustle)/iu.test(family)
          ? "aggregator"
          : "specialist";
  const senderEmail =
    typeof document.metadata?.sender_email === "string"
      ? document.metadata.sender_email.trim().toLowerCase()
      : null;
  const normalizedName =
    normalizeConceptKey(canonicalName) ||
    normalizeConceptKey(senderEmail ?? "") ||
    "unknown source";
  const normalizedFamily = normalizeConceptKey(family) || normalizedName;

  return {
    channel: document.sourceType,
    canonicalName,
    normalizedName,
    sourceFamily: family,
    normalizedFamily,
    externalKey: senderEmail || document.sourceChannel?.trim() || null,
    authorityTier,
  };
}

export const __testables = {
  FAMILY_RULES,
};
