import Link from "next/link";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";
import { Button } from "@/components/ui/button";

export function ContactSection() {
  return (
    <SectionShell
      id="next"
      className="border-t border-border/60 bg-muted/30"
    >
      <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <SectionHeading
            eyebrow="Next"
            title="The next build step is publishing."
            description="The public site now points at real wiki content and keeps the blog ready for the CMS."
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button nativeButton={false} size="lg" render={<Link href="/blog" />}>
            Blog scaffold
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            size="lg"
            render={<Link href="/wiki" />}
          >
            Public wiki
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
