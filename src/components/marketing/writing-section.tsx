import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { SectionHeading, SectionShell } from "@/components/marketing/section-shell";
import type { BlogPostSummary } from "@/lib/blog/data";

export function WritingSection({ posts }: { posts: BlogPostSummary[] }) {
  return (
    <SectionShell id="writing" className="bg-card">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Latest briefs"
            title="Current signals with the source trail intact."
            description="Each morning brief identifies consequential developments, explains why they matter, and links back to the original reporting and deeper wiki context."
          />
          <figure className="technical-grid relative aspect-[4/3] overflow-hidden border border-border/80 bg-background">
            <Image
              src="/images/marketing/crashboard-writing.jpg"
              alt="Editorial desk with research notes and writing materials"
              fill
              sizes="(min-width: 1024px) 36vw, 100vw"
              className="object-cover opacity-70 grayscale"
            />
          </figure>
        </div>

        <div>
          <ul className="grid gap-px border border-border/80 bg-border/80">
            {posts.map((post) => (
              <li key={post.slug} className="bg-card/70">
                <Link
                  href={`/blog/${post.slug}`}
                  className="group grid gap-4 p-5 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[1fr_auto]"
                >
                  <span>
                    <span className="meta-tag">
                      {post.publishedAt
                        ? new Date(post.publishedAt).toLocaleDateString("en-CA", {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          })
                        : "Published"}
                    </span>
                    <span className="mt-2 block font-heading text-xl font-semibold leading-tight text-foreground">
                      {post.title}
                    </span>
                    <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
                      {post.excerpt}
                    </span>
                  </span>
                  <ArrowRightIcon
                    className="mt-1 size-4 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/blog" className="cta-primary">
              Browse the archive
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
            <Link href="/blog/topics" className="cta-secondary">
              Explore research topics
            </Link>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
