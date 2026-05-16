"use client";

import { getGoogleAnalyticsId, getGoogleTagManagerId, type GoogleConsentValue } from "./google";

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

type GoogleConsentState = {
  ad_storage: GoogleConsentValue;
  ad_user_data: GoogleConsentValue;
  ad_personalization: GoogleConsentValue;
  analytics_storage: GoogleConsentValue;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: string, target: string, params?: Record<string, unknown>) => void;
  }
}

function cleanPayload(payload: AnalyticsPayload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
  );
}

function hasTrackingDestination() {
  return Boolean(getGoogleAnalyticsId() || getGoogleTagManagerId());
}

export function updateGoogleConsent(consent: GoogleConsentValue) {
  if (typeof window === "undefined") return;

  const consentState: GoogleConsentState = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: consent,
  };

  window.gtag?.("consent", "update", consentState);
  window.dataLayer?.push({
    event: "consent_update",
    google_analytics_consent: consent,
    ...consentState,
  });
}

export function trackPageView(url: string, title?: string) {
  if (typeof window === "undefined" || !hasTrackingDestination()) return;

  const pageUrl = new URL(url, window.location.origin);
  const payload = {
    page_title: title ?? document.title,
    page_location: pageUrl.href,
    page_path: `${pageUrl.pathname}${pageUrl.search}`,
  };

  const googleAnalyticsId = getGoogleAnalyticsId();
  const googleTagManagerId = getGoogleTagManagerId();
  if (googleAnalyticsId && !googleTagManagerId && window.gtag) {
    window.gtag("event", "page_view", payload);
  }

  if (googleTagManagerId) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({
      event: "page_view",
      ...payload,
    });
  }
}

export function trackEvent(eventName: string, payload?: AnalyticsPayload) {
  if (typeof window === "undefined" || !hasTrackingDestination()) return;

  const eventPayload = cleanPayload(payload);
  const googleTagManagerId = getGoogleTagManagerId();

  if (getGoogleAnalyticsId() && !googleTagManagerId && window.gtag) {
    window.gtag("event", eventName, eventPayload);
  }

  if (googleTagManagerId) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({
      event: eventName,
      ...eventPayload,
    });
  }
}
