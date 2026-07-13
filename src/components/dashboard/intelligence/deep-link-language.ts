import type {
  IntelligenceEntityType,
  IntelligenceEventType,
  IntelligenceSourceType,
} from "@/lib/intelligence/types";

export const ACTION_LABELS: Record<IntelligenceEventType, string> = {
  procurement_notice: "Buying opportunity",
  rfi_rfp_challenge: "Information request or challenge",
  award: "Contract awarded",
  funding_investment: "Funding announced",
  partnership: "Partnership announced",
  acquisition: "Acquisition announced",
  development: "In development",
  trial_pilot: "Being tested",
  deployment: "Entering use",
  policy_regulation: "Policy change",
  capacity_expansion: "Capacity expanding",
  cancellation: "Cancelled",
  other: "Announcement",
};

const SOURCE_LABELS: Record<IntelligenceSourceType, string> = {
  email_newsletter: "Newsletter",
  web_article: "Web article",
  official_release: "Official announcement",
  procurement_notice: "Buying opportunity",
  youtube_video: "Video",
  podcast_episode: "Podcast",
  reddit_post: "Reddit post",
  social_post: "Social post",
};

const CONTENT_LABELS: Record<string, string> = {
  editorial: "Article",
  unknown: "Full newsletter",
  sponsored: "Sponsored content",
  navigation: "Navigation",
  footer: "Footer",
};

const ENTITY_TYPE_LABELS: Record<IntelligenceEntityType, string> = {
  organization: "Organization",
  government_agency: "Government organization",
  program: "Programme",
  product_system: "System",
  capability_technology: "System or technology",
  sector: "Sector",
  geography: "Place",
  alliance: "Alliance",
  person: "Person",
};

const ENTITY_ROLE_LABELS: Record<string, string> = {
  buyer: "Buyer",
  customer: "Customer",
  supplier: "Supplier",
  contractor: "Contractor",
  developer: "Developer",
  manufacturer: "Manufacturer",
  operator: "Operator",
  user: "User",
  partner: "Partner",
  funder: "Funder",
  investor: "Investor",
  recipient: "Recipient",
  regulator: "Regulator",
  owner: "Owner",
  acquirer: "Acquirer",
  target: "Acquisition target",
  mentioned: "Mentioned",
  involved: "Involved",
  system: "System",
};

const EVIDENCE_ROLE_LABELS: Record<string, string> = {
  primary: "Original source",
  official: "Official source",
  newsletter_lead: "Newsletter coverage",
  independent: "Independent coverage",
  secondary: "Independent coverage",
  supporting: "Supporting coverage",
  citation: "Cited source",
};

export function actionLabel(value: unknown) {
  return ACTION_LABELS[value as IntelligenceEventType] ?? "Announcement";
}

export function sourceTypeLabel(value: unknown) {
  return SOURCE_LABELS[value as IntelligenceSourceType] ?? "Source";
}

export function contentTypeLabel(value: unknown) {
  return CONTENT_LABELS[String(value ?? "")] ?? "Source content";
}

export function isTrendEligibleContent(value: unknown) {
  return value === "editorial" || value === "unknown";
}

export function entityTypeLabel(value: unknown) {
  return ENTITY_TYPE_LABELS[value as IntelligenceEntityType] ?? "Related item";
}

export function entityRoleLabel(value: unknown) {
  return ENTITY_ROLE_LABELS[String(value ?? "").trim().toLowerCase()] ?? "Involved";
}

export function evidenceRoleLabel(value: unknown) {
  return EVIDENCE_ROLE_LABELS[String(value ?? "").trim().toLowerCase()] ?? "Supporting source";
}

export function evidenceStrengthLabel(value: unknown) {
  const score = Number(value ?? 0);
  if (score >= 0.75) return "Strong";
  if (score >= 0.6) return "Moderate";
  return "Early";
}

export function trendItemCountLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "items"} used in trends`;
}
