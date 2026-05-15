import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, NetworkIcon } from "lucide-react";
import { homeLinks, siteConfig } from "@/lib/marketing/site-config";
import { Button } from "@/components/ui/button";

export function MarketingHero() {
  return (
    <section className="technical-grid relative overflow-hidden border-b border-border/80 bg-card text-foreground">
      <div className="absolute inset-0">
        <Image
          src="/images/marketing/crashboard-hero.png"
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
          <p className="flex items-center gap-3 font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            {siteConfig.location} / {siteConfig.brandWordmark}
          </p>
          <h1 className="mt-8 max-w-5xl font-heading text-6xl leading-[0.94] font-light tracking-[-0.02em] text-foreground sm:text-7xl md:text-[8.5rem]">
            {siteConfig.publicName}
          </h1>
          <span className="accent-rule mt-5" aria-hidden />
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl md:leading-relaxed">
            {siteConfig.shortBio}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              nativeButton={false}
              size="lg"
              className="rounded-full bg-accent px-6 text-accent-foreground hover:bg-accent/80"
              render={<Link href="/wiki" />}
            >
              <NetworkIcon className="size-4" aria-hidden />
              Browse the wiki
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="outline"
              className="rounded-full border-foreground/15 bg-card/80 px-6 text-foreground hover:border-foreground/30 hover:bg-background"
              render={<Link href="/blog" />}
            >
              <BookOpenIcon className="size-4" aria-hidden />
              Blog roadmap
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="grid gap-px border-y border-foreground/12 bg-foreground/12 md:grid-cols-3">
          {homeLinks.map((block) => (
            <Link
              key={block.href}
              href={block.href}
              className="group bg-card/85 p-5 outline-none backdrop-blur transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h2 className="text-sm font-medium text-foreground">
                {block.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {block.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
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
