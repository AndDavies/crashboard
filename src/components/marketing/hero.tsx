import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, NetworkIcon } from "lucide-react";
import { homeLinks, siteConfig } from "@/lib/marketing/site-config";
import { Button } from "@/components/ui/button";

export function MarketingHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/70 bg-foreground text-background">
      <div className="absolute inset-0">
        <Image
          src="/images/marketing/crashboard-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,15,15,0.9)_0%,rgba(13,15,15,0.74)_38%,rgba(13,15,15,0.32)_78%)]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(0deg,rgba(13,15,15,0.72),rgba(13,15,15,0))]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100svh-10rem)] max-w-7xl flex-col justify-end px-4 py-12 sm:px-6 md:min-h-[42rem] md:py-16">
        <div className="max-w-3xl pb-8">
          <p className="text-xs font-semibold uppercase text-background/70">
            {siteConfig.location} / {siteConfig.brandWordmark}
          </p>
          <h1 className="mt-5 max-w-2xl font-heading text-4xl font-semibold text-background sm:text-5xl md:text-6xl md:leading-[1.04]">
            {siteConfig.publicName}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-background/78 md:text-xl">
            {siteConfig.shortBio}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              nativeButton={false}
              size="lg"
              className="bg-background text-foreground hover:bg-background/90"
              render={<Link href="/wiki" />}
            >
              <NetworkIcon className="size-4" aria-hidden />
              Browse the wiki
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="outline"
              className="border-background/35 bg-background/10 text-background hover:bg-background/18 hover:text-background"
              render={<Link href="/blog" />}
            >
              <BookOpenIcon className="size-4" aria-hidden />
              Blog roadmap
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="grid gap-px overflow-hidden border border-background/18 bg-background/18 md:grid-cols-3">
          {homeLinks.map((block) => (
            <Link
              key={block.href}
              href={block.href}
              className="group bg-foreground/70 p-5 backdrop-blur outline-none transition-colors hover:bg-foreground/82 focus-visible:ring-2 focus-visible:ring-background"
            >
              <h2 className="text-sm font-semibold text-background">
                {block.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-background/68">
                {block.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-background">
                {block.label}
                <ArrowRightIcon
                  className="size-4 transition-transform group-hover:translate-x-1"
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
