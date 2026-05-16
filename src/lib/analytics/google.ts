export type GoogleConsentValue = "denied" | "granted";

export const GOOGLE_CONSENT_STORAGE_KEY = "crashboard:google-consent";

const GOOGLE_ANALYTICS_ID = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim() ?? "";
const GOOGLE_TAG_MANAGER_ID =
  process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID?.trim() ?? "";
const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ?? "";
const GOOGLE_CONSENT_DEFAULT =
  process.env.NEXT_PUBLIC_GOOGLE_CONSENT_DEFAULT?.trim() ?? "";

export function getGoogleAnalyticsId() {
  return GOOGLE_ANALYTICS_ID;
}

export function getGoogleTagManagerId() {
  return GOOGLE_TAG_MANAGER_ID;
}

export function getGoogleSiteVerification() {
  return GOOGLE_SITE_VERIFICATION;
}

export function getGoogleConsentDefault(): GoogleConsentValue {
  return GOOGLE_CONSENT_DEFAULT === "granted" ? "granted" : "denied";
}

export function isGoogleTrackingConfigured() {
  return Boolean(getGoogleAnalyticsId() || getGoogleTagManagerId());
}
