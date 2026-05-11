import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";
import { Button } from "@/components/ui/button";

export function ContactSection() {
  const mailto = `mailto:${siteConfig.email}?subject=Project%20inquiry`;

  return (
    <SectionShell
      id="contact"
      className="border-t border-border/60 bg-muted/30"
    >
      <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <SectionHeading
            eyebrow="Contact"
            title="Send a useful note."
            description="For project work, writing, or collaboration, include the context, the decision you are trying to make, and what would make the exchange worthwhile."
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button nativeButton={false} size="lg" render={<a href={mailto} />}>
            Email
          </Button>
          <Button
            nativeButton={false}
            variant="ghost"
            size="lg"
            className="text-muted-foreground"
            render={<Link href="/login" />}
          >
            Dashboard
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
