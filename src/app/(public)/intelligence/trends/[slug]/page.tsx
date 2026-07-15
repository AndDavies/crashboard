import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChartNoAxesCombined, LibraryBig } from "lucide-react";
import { notFound } from "next/navigation";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { PublicSignalDetail } from "@/components/intelligence/public-signal-detail";
import { IntelligenceSectionNav } from "@/components/intelligence/intelligence-section-nav";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { StructuredData } from "@/components/seo/structured-data";
import { getPublicSignalBySlug } from "@/lib/intelligence/public-data";
import { publicSignalHref } from "@/lib/intelligence/public";
import { absoluteSiteUrl, canonicalUrl, compactDescription } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicSignalBySlug(slug);
  if (!result) return {};
  const canonical = publicSignalHref(result.signal);
  const description = compactDescription(result.signal.whyNow);
  return {
    title: `${result.signal.label} Trend`,
    description,
    alternates: { canonical: canonicalUrl(canonical) },
    openGraph: { title: `${result.signal.label} Trend · Crashboard`, description, url: canonicalUrl(canonical) },
  };
}

export default async function PublicTrendPage({ params }: Props) {
  const { slug } = await params;
  const result = await getPublicSignalBySlug(slug);
  if (!result) notFound();
  const href = publicSignalHref(result.signal);

  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "AnalysisNewsArticle",
          headline: `${result.signal.label} trend analysis`,
          description: result.signal.whyNow,
          dateModified: result.generatedAt,
          mainEntityOfPage: absoluteSiteUrl(href),
          author: { "@type": "Person", name: "Andrew Davies", url: absoluteSiteUrl("/about") },
          about: { "@type": "Thing", name: result.signal.label },
        }}
      />
      <SeoBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }, { label: result.signal.label, href }]} />
      <IntelligenceSectionNav />
      <nav className="mb-8 flex flex-wrap gap-2 border-b border-border pb-5" aria-label="Trend actions">
        <Link href="/intelligence/explore" className="cta-secondary"><ArrowLeft className="size-4" aria-hidden /> Back to Explore</Link>
        <Link href={`/intelligence/explore?signal=${encodeURIComponent(result.signal.id)}&compare=${encodeURIComponent(result.signal.id)}`} className="cta-primary"><ChartNoAxesCombined className="size-4" aria-hidden /> Compare this trend</Link>
        <Link href="/intelligence/articles" className="cta-secondary"><LibraryBig className="size-4" aria-hidden /> Browse supporting sources</Link>
      </nav>
      <PublicSignalDetail signal={result.signal} />
    </MarketingPageFrame>
  );
}
