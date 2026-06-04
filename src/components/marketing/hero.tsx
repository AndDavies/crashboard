import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, NetworkIcon } from "lucide-react";
import { homeLinks, siteConfig } from "@/lib/marketing/site-config";

export function MarketingHero() {
  return (
    <section className="technical-grid relative overflow-hidden border-b border-border/80 bg-card text-foreground">
      <div className="absolute inset-0">
        <Image
          src="/images/marketing/crashboard-hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-[0.18] grayscale contrast-125 brightness-150 mix-blend-multiply"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(250,250,248,0.96)_0%,rgba(250,250,248,0.82)_45%,rgba(250,250,248,0.36)_100%)]" />
        <div className="absolute right-[18%] top-[22%] h-64 w-64 rounded-full border border-foreground/10" />
        <div className="absolute right-[8%] top-[10%] h-[34rem] w-[34rem] rounded-full border border-foreground/7" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100svh-8rem)] max-w-7xl flex-col justify-end px-4 pt-20 pb-10 sm:px-6 md:min-h-[42rem] md:pt-24 md:pb-14">
        <div className="max-w-5xl pb-10">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            {siteConfig.location} / {siteConfig.brandWordmark}
          </p>
          <h1 className="mt-6 max-w-5xl font-heading text-6xl leading-[0.92] font-bold tracking-[-0.04em] text-foreground sm:text-7xl md:text-[8.5rem]">
            {siteConfig.publicName}
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl md:leading-relaxed">
            {siteConfig.shortBio}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/wiki"
              className="group inline-flex items-center justify-between gap-3 border border-accent bg-accent px-5 py-3 text-sm font-semibold tracking-tight text-accent-foreground motion-safe:transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="inline-flex items-center gap-2">
                <NetworkIcon className="size-4" aria-hidden />
                Browse the wiki
              </span>
              <ArrowRightIcon
                className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
            <Link
              href="/blog"
              className="group inline-flex items-center justify-between gap-3 border border-border bg-card/70 px-5 py-3 text-sm font-semibold tracking-tight text-foreground motion-safe:transition-colors hover:border-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="inline-flex items-center gap-2">
                <BookOpenIcon className="size-4" aria-hidden />
                Blog roadmap
              </span>
              <ArrowRightIcon
                className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          </div>
        </div>

        <div className="card-grid md:grid-cols-3">
          {homeLinks.map((block) => (
            <Link
              key={block.href}
              href={block.href}
              className="card-grid-cell group p-5 backdrop-blur"
            >
              <h2 className="text-sm font-medium text-foreground">
                {block.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {block.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                {block.label}
                <ArrowRightIcon
                  className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
