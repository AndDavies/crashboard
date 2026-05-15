import { blogContentModel } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function SkillsSection() {
  return (
    <SectionShell id="blog-model" dense className="bg-background">
      <SectionHeading
        eyebrow="Blog CMS"
        title="The blog is scaffolded around the fields the CMS needs next."
        description="This is structure, not pretend content. Published posts will replace the empty state once the CMS exists."
      />
      <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {blogContentModel.map((field) => (
          <li key={field.field} className="border-t border-border/80 pt-5">
            <h3 className="font-heading text-lg font-light text-foreground">
              {field.field}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {field.description}
            </p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
