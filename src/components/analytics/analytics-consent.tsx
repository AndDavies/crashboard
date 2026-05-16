"use client";

import { useEffect, useState } from "react";
import {
  GOOGLE_CONSENT_STORAGE_KEY,
  getGoogleConsentDefault,
  type GoogleConsentValue,
} from "@/lib/analytics/google";
import { trackEvent, trackPageView, updateGoogleConsent } from "@/lib/analytics/events";
import { Button } from "@/components/ui/button";

function getStoredConsent(): GoogleConsentValue | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(GOOGLE_CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function AnalyticsConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const storedConsent = getStoredConsent();
    if (storedConsent) {
      updateGoogleConsent(storedConsent);
      return;
    }

    const defaultConsent = getGoogleConsentDefault();
    updateGoogleConsent(defaultConsent);
    window.requestAnimationFrame(() => setVisible(defaultConsent === "denied"));
  }, []);

  function saveConsent(consent: GoogleConsentValue) {
    window.localStorage.setItem(GOOGLE_CONSENT_STORAGE_KEY, consent);
    updateGoogleConsent(consent);
    trackEvent("analytics_consent_choice", { consent });
    if (consent === "granted") {
      trackPageView(window.location.href);
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 px-4 py-4 shadow-[0_-18px_60px_rgba(0,0,0,0.12)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          This site uses privacy-light Google Analytics to understand which public
          wiki and blog pages are useful. Advertising storage stays off.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => saveConsent("denied")}>
            Keep off
          </Button>
          <Button type="button" size="sm" onClick={() => saveConsent("granted")}>
            Allow analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
