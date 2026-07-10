import { SectionHeading, SectionShell } from "@/components/marketing/section-shell";

const researchLayers = [
  {
    title: "Morning briefs",
    description:
      "Dated, source-backed scans of developments worth tracking across AI, defence, infrastructure, markets, and institutional change.",
  },
  {
    title: "Topic hubs",
    description:
      "Durable research trails that connect recurring developments and make the archive useful beyond the day each brief was published.",
  },
  {
    title: "Public wiki",
    description:
      "Deeper synthesis, concepts, operating models, and source notes connected through a searchable knowledge graph.",
  },
];

export function SkillsSection() {
  return (
    <SectionShell id="research-system" dense>
      <SectionHeading
        eyebrow="Research system"
        title="From a daily signal to durable context."
        description="The public notebook is organized in layers so readers can scan what changed, follow a recurring question, or inspect the deeper synthesis behind it."
      />
      <ol className="card-grid md:grid-cols-3">
        {researchLayers.map((layer, index) => (
          <li key={layer.title} className="flex flex-col gap-3 bg-card/70 p-5">
            <span className="ordinal">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="font-heading text-xl font-semibold text-foreground">
              {layer.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {layer.description}
            </p>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
