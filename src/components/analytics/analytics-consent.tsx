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
    <aside className="border-b border-border/80 bg-card" aria-label="Analytics preference">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Help improve the public notes with lightweight analytics. No ads.
        </p>
        <div className="flex shrink-0 justify-end gap-2">
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
    </aside>
  );
}
