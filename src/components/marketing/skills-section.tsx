import { capabilityBlocks } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function SkillsSection() {
  return (
    <SectionShell
      id="skills"
      dense
      className="border-y border-border/60 bg-muted/20"
    >
      <SectionHeading
        eyebrow="Capabilities"
        title="How I help teams ship"
        description="Senior-level support across the product surface — without the overhead of a bloated agency model."
      />
      <ul className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {capabilityBlocks.map((block) => (
          <li key={block.title}>
            <h3 className="font-heading text-base font-semibold text-foreground">
              {block.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]">
              {block.body}
            </p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
