import { siteConfig } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AboutSection() {
  return (
    <SectionShell id="about" className="bg-muted/30">
      <SectionHeading
        eyebrow="About"
        title="Clarity over noise"
        description="I partner with teams that care about craft and outcomes — not vanity metrics or endless pivots without ship dates."
      />
      <div className="grid gap-10 md:grid-cols-[1fr_minmax(0,16rem)] md:items-start md:gap-16">
        <div className="max-w-2xl space-y-4 text-base leading-relaxed text-muted-foreground">
          <p>
            {siteConfig.shortBio} I’m strongest when design and engineering stay
            in the same loop: prototypes inform constraints, and implementation
            preserves intent.
          </p>
          <p>
            Recent focus: product UI, design systems, and full-stack delivery
            with Next.js and Supabase — always with accessibility and performance
            as non-negotiables.
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-background p-5 ring-1 ring-foreground/5">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Focus
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground">
            <li>Product design & UX</li>
            <li>Frontend architecture</li>
            <li>Design systems</li>
            <li>Technical writing</li>
          </ul>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="mt-5 w-full"
            render={<Link href="/about" />}
          >
            Full bio
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
