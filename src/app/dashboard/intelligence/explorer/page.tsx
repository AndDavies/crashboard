import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchIntelligenceDocuments } from "@/lib/intelligence/data";

export const metadata: Metadata = { title: "Evidence Explorer · Trend Intelligence" };
export const dynamic = "force-dynamic";

export default async function IntelligenceExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim() ?? "";
  const results = query ? await searchIntelligenceDocuments(query) : [];

  return (
    <div className="space-y-7 pb-14">
      <section className="border-b border-foreground/80 pb-6">
        <p className="editorial-kicker">Trend intelligence / explorer</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold">Search the evidence, not just the summary.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Hybrid retrieval combines full-text matches with semantic similarity. Every result opens the retained private source record or its canonical link.
        </p>
      </section>

      <form className="grid gap-2 border border-border bg-card p-4 sm:grid-cols-[1fr_auto]">
        <label className="sr-only" htmlFor="q">Search evidence</label>
        <Input id="q" name="q" defaultValue={query} placeholder="Search systems, companies, agencies, procurements, funding, trials…" />
        <Button type="submit"><Search className="size-4" /> Search archive</Button>
      </form>

      {query ? (
        <section>
          <div className="flex items-end justify-between gap-4 border-b border-foreground/80 pb-3">
            <div>
              <p className="editorial-kicker">Results</p>
              <h2 className="mt-1 font-heading text-2xl font-semibold">{results.length} matches for “{query}”</h2>
            </div>
          </div>
          <div className="border-x border-b border-border">
            {results.length ? results.map((row) => {
              const matchTypes = row.match_types as string[];
              return (
                <Link
                  key={String(row.document_id ?? row.id)}
                  href={`/dashboard/intelligence/documents/${String(row.document_id ?? row.id)}`}
                  className="block border-t border-border bg-card px-4 py-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {matchTypes.map((type) => <Badge key={type} variant="outline">{type}</Badge>)}
                    <Badge variant="secondary">{String(row.source_type).replaceAll("_", " ")}</Badge>
                    {row.similarity ? <span className="font-mono text-xs text-muted-foreground">{Math.round(Number(row.similarity) * 100)}% semantic</span> : null}
                  </div>
                  <h3 className="mt-2 font-heading text-xl font-semibold">{String(row.title ?? "Untitled source")}</h3>
                  <p className="mt-1 line-clamp-3 max-w-4xl text-sm leading-6 text-muted-foreground">{String(row.summary_short ?? "No summary available.")}</p>
                  <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
                    {row.publisher_name ? <span>{String(row.publisher_name)}</span> : null}
                    {row.published_at ? <span>{String(row.published_at).slice(0, 10)}</span> : null}
                  </div>
                </Link>
              );
            }) : (
              <div className="border-t border-border px-6 py-16 text-center text-sm text-muted-foreground">
                No matching private sources were found. Try a broader system, company, program, or capability term.
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="border border-dashed border-border bg-muted/15 px-6 py-20 text-center">
          <Search className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-4 font-heading text-xl font-semibold">Start with an intelligence question</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Examples: autonomous systems trials, Canadian defence procurement, satellite communications funding, or industrial capacity expansion.
          </p>
          <Button className="mt-5" variant="outline" nativeButton={false} render={<Link href="/dashboard/intelligence" />}>Back to overview</Button>
        </div>
      )}
    </div>
  );
}
