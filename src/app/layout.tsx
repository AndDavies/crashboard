import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { getPublicSiteOrigin } from "@/lib/site-url";
import {
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
} from "@/lib/seo/metadata";
import { getGoogleSiteVerification } from "@/lib/analytics/google";
import { GoogleConsentDefaultScript } from "@/components/analytics/google-tracking";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleSiteVerification = getGoogleSiteVerification();

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteOrigin()),
  title: {
    default: "Andrew Davies | Crashboard",
    template: `%s | ${SEO_SITE_NAME}`,
  },
  description: SEO_DEFAULT_DESCRIPTION,
  alternates: {
    types: {
      "application/rss+xml": absoluteSiteUrl("/feed.xml"),
    },
  },
  openGraph: {
    type: "website",
    siteName: SEO_SITE_NAME,
    title: "Andrew Davies | Crashboard",
    description: SEO_DEFAULT_DESCRIPTION,
    url: absoluteSiteUrl("/"),
    images: [{ url: SEO_DEFAULT_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Andrew Davies | Crashboard",
    description: SEO_DEFAULT_DESCRIPTION,
    images: [SEO_DEFAULT_IMAGE],
  },
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleConsentDefaultScript />
        {children}
      </body>
    </html>
  );
}
