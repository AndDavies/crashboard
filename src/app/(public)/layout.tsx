import { Suspense } from "react";
import { AnalyticsConsentBanner } from "@/components/analytics/analytics-consent";
import {
  GoogleTagManagerNoScript,
  GoogleTrackingScripts,
} from "@/components/analytics/google-tracking";
import { InteractionAnalytics } from "@/components/analytics/interaction-analytics";
import { RouteAnalytics } from "@/components/analytics/route-analytics";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { isGoogleTrackingConfigured } from "@/lib/analytics/google";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const googleTrackingConfigured = isGoogleTrackingConfigured();

  return (
    <>
      <GoogleTagManagerNoScript />
      <SiteHeader />
      {googleTrackingConfigured ? <AnalyticsConsentBanner /> : null}
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      <GoogleTrackingScripts />
      {googleTrackingConfigured ? (
        <>
          <Suspense fallback={null}>
            <RouteAnalytics />
          </Suspense>
          <InteractionAnalytics />
        </>
      ) : null}
    </>
  );
}
