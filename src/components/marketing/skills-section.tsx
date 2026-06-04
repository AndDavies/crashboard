import { blogContentModel } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function SkillsSection() {
  return (
    <SectionShell id="blog-model" dense>
      <SectionHeading
        eyebrow="Blog CMS"
        title="The blog is scaffolded around the fields the CMS needs next."
        description="This is structure, not pretend content. Published posts will replace the empty state once the CMS exists."
      />
      <ul className="card-grid sm:grid-cols-2 lg:grid-cols-3">
        {blogContentModel.map((field, index) => (
          <li
            key={field.field}
            className="flex flex-col gap-2 bg-card/70 p-5 motion-safe:transition-colors hover:bg-card"
          >
            <span className="ordinal">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {field.field}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {field.description}
            </p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
