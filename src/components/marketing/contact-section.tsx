import Link from "next/link";
import { SectionShell } from "@/components/marketing/section-shell";
import { Button } from "@/components/ui/button";

export function ContactSection() {
  return (
    <SectionShell
      id="next"
      className="border-b-0 bg-foreground text-background"
    >
      <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="mb-4 text-xs font-medium tracking-[0.18em] text-background/55 uppercase">
            Next
          </p>
          <h2 className="font-heading text-4xl leading-[1.02] font-light text-background md:text-6xl">
            The next build step is publishing.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-background/65 md:text-lg">
            The public site now points at real wiki content and keeps the blog
            ready for the CMS.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            nativeButton={false}
            size="lg"
            className="rounded-full bg-accent px-6 text-accent-foreground hover:bg-accent/85"
            render={<Link href="/blog" />}
          >
            Blog scaffold
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            size="lg"
            className="rounded-full border-background/20 bg-transparent px-6 text-background hover:bg-background/10 hover:text-background"
            render={<Link href="/wiki" />}
          >
            Public wiki
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
