import { capabilityBlocks } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function SkillsSection() {
  return (
    <SectionShell id="systems" dense className="bg-background">
      <SectionHeading
        eyebrow="Sections to grow"
        title="A scaffold for the parts of a personal site that should compound."
        description="The site now has clean places for essays, field notes, links, projects, and private dashboard access."
      />
      <ul className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {capabilityBlocks.map((block) => (
          <li key={block.title} className="border-t border-border/80 pt-5">
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
