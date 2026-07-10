import type { Metadata } from "next";
import { MarketingHero } from "@/components/marketing/hero";
import { AboutSection } from "@/components/marketing/about-section";
import { ProjectsSection } from "@/components/marketing/projects-section";
import { SkillsSection } from "@/components/marketing/skills-section";
import { WritingSection } from "@/components/marketing/writing-section";
import { ContactSection } from "@/components/marketing/contact-section";
import { StructuredData } from "@/components/seo/structured-data";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import {
  SEO_AUTHOR_NAME,
  SEO_AUTHOR_SAME_AS,
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
} from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: SEO_AUTHOR_NAME,
  description: SEO_DEFAULT_DESCRIPTION,
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    title: "Andrew Davies | Crashboard",
    description: SEO_DEFAULT_DESCRIPTION,
    url: canonicalUrl("/"),
    images: [{ url: SEO_DEFAULT_IMAGE, width: 1200, height: 630 }],
  },
};

export default async function Home() {
  const posts = await getPublishedBlogPosts();

  return (
    <>
      <StructuredData
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
            url: absoluteSiteUrl("/"),
            sameAs: SEO_AUTHOR_SAME_AS,
            address: {
              "@type": "PostalAddress",
              addressLocality: "Halifax",
              addressRegion: "Nova Scotia",
              addressCountry: "CA",
            },
            knowsAbout: [
              "AI workflows",
              "knowledge systems",
              "defence strategy",
              "source-backed research",
              "personal knowledge management",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SEO_SITE_NAME,
            url: absoluteSiteUrl("/"),
            author: { "@type": "Person", name: SEO_AUTHOR_NAME },
            description: SEO_DEFAULT_DESCRIPTION,
          },
        ]}
      />
      <MarketingHero />
      <AboutSection />
      <ProjectsSection />
      <SkillsSection />
      <WritingSection posts={posts.slice(0, 3)} />
      <ContactSection />
    </>
  );
}
