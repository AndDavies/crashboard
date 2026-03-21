import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { Button } from "@/components/ui/button";
import { SectionShell } from "@/components/marketing/section-shell";

export function MarketingHero() {
  return (
    <SectionShell className="border-b border-border/60 bg-background pb-12 md:pb-16">
      <div className="max-w-3xl">
        <p className="mb-4 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {siteConfig.location}
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-[3.25rem] md:leading-[1.1]">
          {siteConfig.publicName}
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          {siteConfig.title}. {siteConfig.shortBio}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            nativeButton={false}
            render={<Link href="/contact" />}
            size="lg"
          >
            Get in touch
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/work" />}
            variant="outline"
            size="lg"
          >
            View selected work
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/login" />}
            variant="ghost"
            size="lg"
            className="text-muted-foreground sm:ml-1"
          >
            Log in
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
