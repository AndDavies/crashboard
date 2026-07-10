import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { homeLinks, operatingNotes, siteConfig } from "@/lib/marketing/site-config";

export function MarketingHero() {
  return (
    <section className="border-b border-border/80 bg-card text-foreground">
      <div className="technical-grid relative min-h-[32rem] overflow-hidden border-b border-border/80 sm:min-h-[38rem]">
      <div className="absolute inset-0">
        <Image
          src="/images/marketing/crashboard-hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-[0.23] grayscale contrast-125 brightness-150 mix-blend-multiply"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(250,250,248,0.96)_0%,rgba(250,250,248,0.82)_45%,rgba(250,250,248,0.36)_100%)]" />
      </div>

      <div className="container-wide relative flex min-h-[32rem] flex-col justify-end py-12 sm:min-h-[38rem] sm:py-16">
        <div className="max-w-4xl">
          <p className="eyebrow">{siteConfig.location} / {siteConfig.brandWordmark}</p>
          <h1 className="mt-6 max-w-4xl font-heading text-5xl font-semibold leading-[0.98] text-foreground sm:text-6xl md:text-7xl">
            {siteConfig.publicName}
          </h1>
          <p className="mt-7 max-w-2xl font-heading text-2xl leading-snug text-foreground/80 md:text-3xl">
            {siteConfig.title}
          </p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {siteConfig.shortBio}
          </p>
        </div>
      </div>
      </div>

      <div className="container-wide py-12 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="max-w-3xl space-y-5 font-serif text-lg leading-8 text-foreground/80">
            <p>
              Crashboard is where finished-enough thinking leaves the private
              notebook. The wiki holds the current corpus: source-backed pages,
              recurring concepts, and the connective tissue between them.
            </p>
            <p>
              The blog is for questions that need a fuller answer than a wiki
              page can carry: how a workflow works, what a source trail proves,
              and where the judgment is still uncertain.
            </p>
            <Link href="/about" className="link-accent inline-flex items-center gap-2 font-sans text-sm">
              Read the fuller profile
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
          <aside className="section-rule pt-4">
            <p className="eyebrow">Operating posture</p>
            <ol className="mt-3 divide-y divide-border/80 border-b border-border/80">
              {operatingNotes.map((note, index) => (
                <li key={note} className="grid grid-cols-[2rem_1fr] gap-3 py-3 text-sm leading-relaxed">
                  <span className="ordinal">{String(index + 1).padStart(2, "0")}</span>
                  <span>{note}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <nav className="mt-12 border-y border-foreground/80" aria-label="Start exploring">
          {homeLinks.map((block) => (
            <Link
              key={block.href}
              href={block.href}
              className="group grid gap-3 border-b border-border/80 py-5 last:border-b-0 sm:grid-cols-[11rem_1fr_auto] sm:items-center"
            >
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {block.title}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {block.body}
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                {block.label}
                <ArrowRightIcon
                  className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
