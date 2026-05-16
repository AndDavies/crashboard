import Script from "next/script";
import {
  getGoogleAnalyticsId,
  getGoogleConsentDefault,
  getGoogleTagManagerId,
  isGoogleTrackingConfigured,
} from "@/lib/analytics/google";

export function GoogleTrackingScripts() {
  const googleAnalyticsId = getGoogleAnalyticsId();
  const googleTagManagerId = getGoogleTagManagerId();

  if (!isGoogleTrackingConfigured()) return null;

  return (
    <>
      {googleTagManagerId ? (
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${googleTagManagerId}');
          `}
        </Script>
      ) : null}

      {!googleTagManagerId && googleAnalyticsId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${googleAnalyticsId}', { send_page_view: false });
            `}
          </Script>
        </>
      ) : null}
    </>
  );
}

export function GoogleConsentDefaultScript() {
  const defaultConsent = getGoogleConsentDefault();

  if (!isGoogleTrackingConfigured()) return null;

  return (
    <Script id="google-consent-default" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('consent', 'default', {
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
          analytics_storage: '${defaultConsent}'
        });
      `}
    </Script>
  );
}

export function GoogleTagManagerNoScript() {
  const googleTagManagerId = getGoogleTagManagerId();
  if (!googleTagManagerId) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`}
        height="0"
        width="0"
        className="hidden invisible"
        title="Google Tag Manager"
      />
    </noscript>
  );
}
