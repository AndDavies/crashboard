import type { Metadata } from "next";
import { WikiExplorer } from "@/components/wiki/wiki-explorer";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";

export const metadata: Metadata = {
  title: "Wiki",
  description:
    "A public web version of Andrew Davies' compiled wiki: source-backed notes, concepts, workflows, and synthesis.",
};

export default function WikiPage() {
  const index = getPublicWikiIndex();
  const sourceNotes = index.pages.reduce((sum, page) => sum + page.sourceNotes.length, 0);
  const linkedEdges = index.graph.edges.length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
      <section className="grid gap-8 border-b border-border/80 pb-10 lg:grid-cols-[1fr_28rem] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Public wiki
          </p>
          <h1 className="mt-4 max-w-4xl font-heading text-5xl font-semibold tracking-tight text-foreground md:text-7xl md:leading-[0.98]">
            A compiled map of what I am learning.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            This is the public web version of my LLM-maintained wiki: source-backed
            pages, recurring concepts, operating models, and links between ideas.
            The raw evidence stays private; the synthesis is here to browse.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Pages", index.pages.length.toLocaleString()],
            ["Sources", sourceNotes.toLocaleString()],
            ["Links", linkedEdges.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/80 bg-card/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-3 font-heading text-3xl font-semibold text-foreground">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Browse the graph
          </h2>
          <WikiExplorer index={index} />
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <WikiGraph nodes={index.graph.nodes} edges={index.graph.edges} compact />
          <div className="rounded-lg border border-border/80 bg-card/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Clusters
            </p>
            <div className="mt-3 space-y-2">
              {index.clusters.map((cluster) => (
                <div key={cluster.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="capitalize text-muted-foreground">{cluster.label}</span>
                  <span className="font-medium tabular-nums text-foreground">{cluster.count}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
