export const DEFAULT_INTELLIGENCE_OWNER_EMAIL = "m.andrew.davies@gmail.com";

export function canonicalIntelligenceOwnerId(email?: string | null) {
  const normalized = (email || process.env.INTELLIGENCE_OWNER_EMAIL || DEFAULT_INTELLIGENCE_OWNER_EMAIL)
    .trim()
    .toLocaleLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("A valid Intelligence owner email is required.");
  }
  return `google:${normalized}`;
}

export function intelligenceOwnerIdForUser(user: { email?: string | null }) {
  return canonicalIntelligenceOwnerId(user.email);
}
