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
    <div className="fixed right-4 bottom-4 left-4 z-50 sm:left-auto sm:max-w-sm">
      <div className="border border-border/80 bg-background/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.12)] backdrop-blur">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Help improve the public notes with lightweight analytics. No ads.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => saveConsent("denied")}
          >
            No thanks
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => saveConsent("granted")}
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
