import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { SectionHeading, SectionShell } from "@/components/marketing/section-shell";
import type { BlogPostSummary } from "@/lib/blog/data";

export function WritingSection({ posts }: { posts: BlogPostSummary[] }) {
  const [featured, ...archive] = posts;

  return (
    <SectionShell id="writing" className="bg-background">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Latest briefs"
            title="Current signals with the source trail intact."
            description="Each morning brief identifies consequential developments, explains why they matter, and links back to the original reporting and deeper wiki context."
          />
          {featured ? (
            <Link href={`/blog/${featured.slug}`} className="group block border-y border-foreground/80 py-5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <figure className="relative aspect-[16/9] overflow-hidden bg-muted">
                <Image src="/images/marketing/crashboard-writing.jpg" alt="Editorial desk with research notes and writing materials" fill sizes="(min-width: 1024px) 56vw, 100vw" className="object-cover grayscale transition-transform duration-500 group-hover:scale-[1.015]" />
              </figure>
              <p className="eyebrow mt-5">Current brief</p>
              <h3 className="mt-2 max-w-3xl font-heading text-3xl font-semibold leading-tight text-foreground md:text-4xl">{featured.title}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{featured.excerpt}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground">Read the brief <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>
          ) : null}
        </div>

        <div className="lg:pt-20">
          <p className="eyebrow">Recent archive</p>
          <ul className="mt-4 border-y border-foreground/80">
            {archive.map((post) => (
              <li key={post.slug} className="border-b border-border/80 last:border-b-0">
                <Link
                  href={`/blog/${post.slug}`}
                  className="group grid gap-4 py-5 outline-none hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto]"
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
                    <span className="mt-2 block font-heading text-2xl font-semibold leading-tight text-foreground">
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
