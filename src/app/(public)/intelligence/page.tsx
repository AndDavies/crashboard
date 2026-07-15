import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IntelligenceOverview } from "@/components/dashboard/intelligence/intelligence-overview";
import { IntelligenceSectionNav } from "@/components/intelligence/intelligence-section-nav";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { StructuredData } from "@/components/seo/structured-data";
import { getPublicIntelligenceUiData } from "@/lib/intelligence/public-data";
import { absoluteSiteUrl, canonicalUrl } from "@/lib/seo/metadata";

const description = "Evidence-backed trends across defence, AI, cyber, industry, policy, procurement, and emerging technology.";

export const metadata: Metadata = {
  title: "Trend Intelligence",
  description,
  alternates: { canonical: canonicalUrl("/intelligence") },
  openGraph: {
    title: "Trend Intelligence · Crashboard",
    description,
    url: canonicalUrl("/intelligence"),
  },
};

export const dynamic = "force-dynamic";

export default async function PublicIntelligencePage() {
  const data = await getPublicIntelligenceUiData({ range: "90d", lens: "all", kind: "all" });

  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Crashboard Trend Intelligence",
          description,
          url: absoluteSiteUrl("/intelligence"),
          about: ["Defence industry", "Artificial intelligence", "Cybersecurity", "Public procurement"],
        }}
      />
      <SeoBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }]} />
      <IntelligenceSectionNav />
      <IntelligenceOverview
        signals={data.signals}
        completeThrough={data.completeThrough}
        completedResearch={data.completedResearch}
        dataStatus={data.dataStatus}
        usesLegacyFallback={data.usesLegacyFallback}
        publicView
      />
      <aside className="grid gap-4 border-t border-foreground pt-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-heading text-2xl font-semibold">Explore the complete source trail</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Search the retained evidence, compare signals, or browse the monitored source summaries.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/intelligence/explore" className="cta-primary">Explore trends <ArrowRight className="size-4" /></Link>
          <Link href="/intelligence/articles" className="cta-secondary">Browse sources <ArrowRight className="size-4" /></Link>
        </div>
      </aside>
    </MarketingPageFrame>
  );
}
