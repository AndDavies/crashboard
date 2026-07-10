import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, NetworkIcon, BookOpenIcon } from "lucide-react";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { StructuredData } from "@/components/seo/structured-data";
import {
  SEO_AUTHOR_NAME,
  SEO_DEFAULT_IMAGE,
  SEO_DEFAULT_DESCRIPTION,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
} from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Andrew Davies, Crashboard, and the public notebook behind his AI workflow, research-system, and strategy writing.",
  alternates: { canonical: canonicalUrl("/about") },
  openGraph: {
    title: "About Andrew Davies · Crashboard",
    description:
      "About Andrew Davies, Crashboard, and the public notebook behind his AI workflow, research-system, and strategy writing.",
    url: canonicalUrl("/about"),
    images: [{ url: SEO_DEFAULT_IMAGE, width: 1200, height: 630 }],
  },
};

const principles = [
  "Write from evidence, not posture.",
  "Give readers the trail: sources, decisions, and caveats.",
  "Make the wiki useful before making the blog busy.",
  "Build tools that improve judgment, not dashboards that decorate it.",
];

export default function AboutPage() {
  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: "About Andrew Davies",
          url: absoluteSiteUrl("/about"),
          description: SEO_DEFAULT_DESCRIPTION,
          isPartOf: {
            "@type": "WebSite",
            name: SEO_SITE_NAME,
            url: absoluteSiteUrl("/"),
          },
          mainEntity: {
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
            url: absoluteSiteUrl("/about"),
            homeLocation: {
              "@type": "Place",
              name: "Halifax, Nova Scotia",
            },
            knowsAbout: [
              "AI workflows",
              "source-backed research",
              "personal knowledge systems",
              "defence strategy",
              "knowledge management",
            ],
          },
        }}
      />
      <p className="eyebrow">About</p>
      <h1 className="mt-6 max-w-4xl font-heading text-5xl leading-[1.02] font-semibold text-foreground md:text-6xl">
        I use Crashboard to turn private research into public working notes.
      </h1>
      <div className="mt-10 grid gap-12 border-t border-foreground/80 pt-8 lg:grid-cols-[1fr_22rem]">
        <div className="max-w-[44rem] space-y-6 font-serif text-lg leading-8 text-foreground/80">
          <p>
            I am Andrew Davies, based in Halifax. I work on practical AI
            workflows, research systems, defence and strategy questions, and
            the knowledge infrastructure that holds those threads together.
          </p>
          <p>
            Crashboard is where finished-enough thinking leaves the private
            notebook: source-backed wiki pages first, then essays when a
            question deserves a longer answer.
          </p>
          <p>
            Most of the raw material stays private. What appears here should
            help a reader understand the question, follow the evidence, and
            reuse the pattern.
          </p>
        </div>
        <aside className="border-t border-foreground/80 pt-4 lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">Principles</p>
          <ul className="mt-3 divide-y divide-border/80 border-b border-border/80">
            {principles.map((principle, index) => (
              <li
                key={principle}
                className="flex items-start gap-3 py-3 text-sm leading-relaxed text-foreground"
              >
                <span className="ordinal mt-0.5">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">{principle}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/wiki"
          className="cta-primary group justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <NetworkIcon className="size-4" aria-hidden />
            Browse wiki
          </span>
          <ArrowRightIcon
            className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
        <Link
          href="/blog"
          className="cta-secondary group justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <BookOpenIcon className="size-4" aria-hidden />
            Read writing
          </span>
          <ArrowRightIcon
            className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      </div>
    </MarketingPageFrame>
  );
}
